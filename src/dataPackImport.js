// Getting a pack INTO the store, having checked that it is one.
//
// `filesFromText` turns pasted text into a map of pack path to JSON, but it cannot tell whether the contents
// are a data pack or a recipe for disaster. This is the step that runs the real loader over the result and
// refuses anything with nothing loadable in it -- so the store never holds a "pack" that would apply nothing
// while looking like it had worked.
import { createDataPack } from './dataPack.js';
import { addPack, PACK_SOURCES } from './dataPackStore.js';
import { filesFromText } from './dataPackStore.js';

/** The types a single pasted generator file can be, in the order the generators list them. */
export const PASTE_TYPES = [
  { value: 'worldgen/biome', label: 'Biome' },
  { value: 'dimension_type', label: 'Dimension Type' },
  { value: 'worldgen/placed_feature', label: 'Placed Feature' },
  { value: 'worldgen/structure', label: 'Structure' },
  { value: 'recipe', label: 'Recipe' },
  { value: 'loot_table', label: 'Loot Table' },
  { value: 'tags/item', label: 'Item Tag' },
  { value: 'tags/block', label: 'Block Tag' },
];

/**
 * Import pasted text into a store.
 *
 * @param {object} store
 * @param {string} text raw JSON, either a whole data pack or one generator's output
 * @param {{name?:string, type?:string, id?:string, namespace?:string, enabled?:boolean, source?:string}} [options]
 * @returns {{ok:boolean, pack?:object, errors:string[], skipped:Array, entries:number}}
 */
export function importPastedText(store, text, options = {}) {
  const turned = filesFromText(text, {
    type: options.type,
    id: options.id,
    namespace: options.namespace,
  });
  if (!turned.ok) return { ok: false, errors: turned.errors, skipped: [], entries: 0 };

  return importFiles(store, turned.files, options);
}

/**
 * Import a set of already-read files into a store.
 *
 * Separate from `importPastedText` so an uploaded data pack folder (`<input type="file" multiple>`) goes
 * through exactly the same validation as a paste.
 *
 * @param {object} store
 * @param {object} files map of pack path to JSON text
 * @returns {{ok:boolean, pack?:object, errors:string[], skipped:Array, entries:number}}
 */
export function importFiles(store, files, options = {}) {
  if (!files || typeof files !== 'object' || Object.keys(files).length === 0) {
    return { ok: false, errors: ['nothing to load'], skipped: [], entries: 0 };
  }

  const built = createDataPack({
    name: options.name ?? defaultName(options),
    format: options.format,
    files,
  });

  // A pack with nothing loadable is refused rather than stored. Otherwise the UI would list it, the player
  // would switch it on, and nothing would happen with no explanation.
  if (built.entries.length === 0) {
    const reasons = built.skipped.slice(0, 3).map(s => `${s.path}: ${s.reason}`);
    return {
      ok: false,
      errors: ['nothing in this file is a data pack entry the game can load', ...reasons],
      skipped: built.skipped,
      entries: 0,
    };
  }

  const added = addPack(store, {
    name: built.name,
    files,
    source: options.source ?? PACK_SOURCES.PASTED,
    format: built.format,
    enabled: options.enabled !== false,
  });
  if (!added.ok) return { ok: false, errors: [added.reason], skipped: built.skipped, entries: built.entries.length };

  return {
    ok: true,
    pack: added.pack,
    // Recorded rather than treated as failure: a pack with some unusable files still loads the rest, and the
    // player should be able to see which ones did not make it.
    errors: [],
    skipped: built.skipped,
    entries: built.entries.length,
  };
}

/** A name for a pack the caller did not name. */
function defaultName(options = {}) {
  if (typeof options.name === 'string' && options.name.trim()) return options.name.trim();
  if (options.id) return String(options.id);
  return 'Pasted pack';
}

/**
 * Read uploaded File objects into the map `importFiles` wants.
 *
 * Kept separate from the import so the file reading -- the part that needs a browser -- is not in the way of
 * testing the validation.
 *
 * @param {Array<{name:string, text?:string, webkitRelativePath?:string}>} entries
 * @returns {object} path -> text
 */
export function filesFromUploads(entries) {
  const files = {};
  for (const entry of entries ?? []) {
    if (!entry || typeof entry.name !== 'string') continue;
    // A folder upload gives `webkitRelativePath` like `mypack/data/x/recipe/a.json`; the pack path starts at
    // `data/`, so the folder name is stripped. Anything outside `data/` -- `pack.mcmeta` is the only real
    // case -- is taken as its own basename, since it sits at the root of a pack by definition.
    const raw = entry.webkitRelativePath || entry.name;
    const path = raw.replace(/\\/g, '/');
    const at = path.indexOf('data/');
    const key = at >= 0 ? path.slice(at) : path.slice(path.lastIndexOf('/') + 1);
    if (!key.endsWith('.json') && !key.endsWith('.mcmeta')) continue;
    if (typeof entry.text === 'string') files[key] = entry.text;
  }
  return files;
}

/**
 * A one-line status for an import, for the UI.
 */
export function describeImport(result) {
  if (!result) return '';
  if (!result.ok) return result.errors[0] ?? 'could not load';
  const bits = [`Loaded ${result.entries} file(s)`];
  if (result.skipped.length) bits.push(`${result.skipped.length} skipped`);
  return bits.join(', ');
}
