// Data packs: the format misode.github.io's generators write.
//
// World generation and content in this game are hand-written code -- `src/biomes.js` is 1603 lines of biome
// literals, `src/worldgen/` is a structure engine, and recipes came from a build-time fetch of
// PrismarineJS/minecraft-data. None of it could be fed a file. This module is the missing input: it reads a
// data pack the way the game reads a data pack, so the JSON those generators produce can drive the world.
//
// A pack is a flat map of path -> parsed JSON, exactly as a data pack folder or zip lays out:
//
//     data/<namespace>/worldgen/biome/plains.json
//     data/<namespace>/recipe/oak_planks.json
//
// The path IS the type. That is the whole trick, and it is why this module is mostly a path table.

/**
 * Every type this loader understands, keyed by the directory a file sits in.
 *
 * `dirs` is a list because the layout was renamed in 1.21: `recipes` became `recipe` and `loot_tables` became
 * `loot_table`. A pack written for either version loads, which matters because the generators let you pick a
 * target version and older output is still on disk everywhere.
 */
export const PACK_TYPES = Object.freeze({
  biome: { dirs: ['worldgen/biome'], adapter: 'biome' },
  dimension_type: { dirs: ['dimension_type'], adapter: 'dimensionType' },
  placed_feature: { dirs: ['worldgen/placed_feature'], adapter: 'placedFeature' },
  configured_feature: { dirs: ['worldgen/configured_feature'], adapter: 'configuredFeature' },
  structure: { dirs: ['worldgen/structure'], adapter: 'structure' },
  structure_set: { dirs: ['worldgen/structure_set'], adapter: 'structureSet' },
  template_pool: { dirs: ['worldgen/template_pool'], adapter: 'templatePool' },
  processor_list: { dirs: ['worldgen/processor_list'], adapter: 'processorList' },
  noise_settings: { dirs: ['worldgen/noise_settings'], adapter: 'noiseSettings' },
  recipe: { dirs: ['recipe', 'recipes'], adapter: 'recipe' },
  loot_table: { dirs: ['loot_table', 'loot_tables'], adapter: 'lootTable' },
  block_tag: { dirs: ['tags/block', 'tags/blocks'], adapter: 'tag' },
  item_tag: { dirs: ['tags/item', 'tags/items'], adapter: 'tag' },
});

/**
 * The pack format this build writes and prefers.
 *
 * 48 is 1.21.4's, which is the version the spawn data already targets. A pack that declares a different
 * format still loads -- refusing it would make the loader useless for the version picker in the generators --
 * but the mismatch is recorded so the UI can say so.
 */
export const PREFERRED_PACK_FORMAT = 48;

/** A directory to its type, built once. */
const DIR_TO_TYPE = (() => {
  const map = new Map();
  for (const [type, spec] of Object.entries(PACK_TYPES)) {
    for (const dir of spec.dirs) map.set(dir, type);
  }
  return map;
})();

/** Longest directory first, so `tags/block` is tried before a hypothetical `tags`. */
const DIRS_BY_LENGTH = [...DIR_TO_TYPE.keys()].sort((a, b) => b.length - a.length);

/**
 * Clean a namespaced id.
 *
 * `minecraft:oak_planks` and `oak_planks` are the same id, and vanilla ids are lower case with a restricted
 * character set. An id that cannot be clean is rejected rather than coerced, because a silently mangled id
 * becomes a file that never loads and a bug nobody can find.
 *
 * @returns {string|null} `namespace:path`, or null when it is not a usable id
 */
export function normaliseId(raw, defaultNamespace = 'minecraft') {
  if (typeof raw !== 'string') return null;
  let value = raw.trim();
  if (!value) return null;
  // A leading `#` marks a tag reference rather than an id; it is preserved by the tag adapter, not here.
  if (value.startsWith('#')) value = value.slice(1);
  let namespace = defaultNamespace;
  const colon = value.indexOf(':');
  if (colon >= 0) {
    namespace = value.slice(0, colon);
    value = value.slice(colon + 1);
  }
  namespace = namespace.trim().toLowerCase();
  value = value.trim().toLowerCase();
  if (!namespace || !value) return null;
  if (!/^[a-z0-9_.-]+$/.test(namespace)) return null;
  if (!/^[a-z0-9_./-]+$/.test(value)) return null;
  return `${namespace}:${value}`;
}

/** Split an id into its parts, for a caller that wants them separately. */
export function splitId(id) {
  const normalised = normaliseId(id);
  if (!normalised) return null;
  const colon = normalised.indexOf(':');
  return { namespace: normalised.slice(0, colon), path: normalised.slice(colon + 1) };
}

/**
 * Work out what a pack file is from where it sits.
 *
 * The type directory is matched as the longest PREFIX, and whatever follows is part of the id. That matters
 * because nesting is normal in a real pack -- `loot_tables/entities/pig.json` is the classic vanilla layout,
 * and `loot_tables/chests/village/village_plains_house.json` nests two deep. Matching the whole directory
 * instead silently ignored every nested file, which is most of a vanilla loot table pack.
 *
 * @param {string} path e.g. `data/vanilla/worldgen/biome/plains.json`
 * @returns {{namespace:string, type:string, path:string, id:string, adapter:string}|null}
 *   null for anything the loader does not handle -- `pack.mcmeta`, a `.DS_Store`, a type from a newer version.
 *   An unknown file is not an error: a data pack always carries things a given reader does not implement.
 */
export function parsePackPath(path) {
  if (typeof path !== 'string') return null;
  // Normalise separators so a Windows-style path from a zip listing still works.
  const clean = path.replace(/\\/g, '/').replace(/^\.?\//, '');
  const parts = clean.split('/').filter(Boolean);
  if (parts.length < 4) return null;
  if (parts[0] !== 'data') return null;
  if (!parts[parts.length - 1].endsWith('.json')) return null;

  const namespace = parts[1];
  // Everything between the namespace and the filename. The type is a prefix of this, and the remainder is
  // part of the id.
  const middle = parts.slice(2, -1).join('/');
  const dir = DIRS_BY_LENGTH.find(candidate => middle === candidate || middle.startsWith(candidate + '/'));
  if (!dir) return null;
  const type = DIR_TO_TYPE.get(dir);
  const remainder = middle.slice(dir.length).replace(/^\//, '');

  const file = parts[parts.length - 1].slice(0, -'.json'.length);
  const idPath = remainder ? `${remainder}/${file}` : file;
  const id = normaliseId(`${namespace}:${idPath}`);
  if (!id) return null;

  return { namespace, type, path: idPath, id, adapter: PACK_TYPES[type].adapter };
}

/** Is this the pack's own metadata rather than a loadable entry? */
export function isPackMeta(path) {
  return typeof path === 'string' && /(^|\/)pack\.mcmeta$/.test(path.replace(/\\/g, '/'));
}

/**
 * The minimum a JSON object of each type must have to be worth handing to an adapter.
 *
 * Deliberately shallow. This is a shape check, not a schema: the generators let you emit a half-finished file
 * and saving it is not an error, but a file missing the one field its adapter reads would otherwise fail deep
 * inside world generation where the cause is invisible.
 */
const REQUIRED_FIELDS = Object.freeze({
  biome: [],
  dimensionType: [],
  recipe: ['type'],
  lootTable: ['pools'],
  tag: ['values'],
  placedFeature: ['feature', 'placement'],
  configuredFeature: ['type'],
  structure: ['type'],
  structureSet: ['structures', 'placement'],
  templatePool: ['elements'],
  processorList: [],
  noiseSettings: [],
});

/**
 * Check one entry.
 *
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateEntry(type, json) {
  const errors = [];
  const spec = PACK_TYPES[type];
  if (!spec) return { ok: false, errors: [`unknown type ${type}`] };
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    return { ok: false, errors: ['not a JSON object'] };
  }
  for (const field of REQUIRED_FIELDS[spec.adapter] ?? []) {
    if (json[field] === undefined) errors.push(`missing "${field}"`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Build a validated pack.
 *
 * Files that fail to parse or fail validation are **reported, not thrown**: a pack assembled in a browser tab
 * will have something wrong in it, and losing the other two hundred files to one bad recipe is worse than
 * loading what works and naming what did not.
 *
 * @param {{name?:string, format?:number, description?:string, files:object|Map<string,object>}} input
 *   `files` maps pack paths to already-parsed JSON, or to a raw JSON string, which is what a paste produces.
 */
export function createDataPack(input = {}) {
  const raw = input.files instanceof Map ? Object.fromEntries(input.files) : (input.files ?? {});
  const entries = [];
  const skipped = [];

  for (const [path, content] of Object.entries(raw)) {
    // `pack.mcmeta` is the pack's own metadata, read by `readPackMeta`, not an entry the loader refuses.
    if (isPackMeta(path)) continue;
    const parsed = parsePackPath(path);
    if (!parsed) { skipped.push({ path, reason: 'not a data pack path this loader handles' }); continue; }

    let json = content;
    if (typeof content === 'string') {
      try {
        json = JSON.parse(content);
      } catch (err) {
        skipped.push({ path, reason: `invalid JSON: ${err.message}` });
        continue;
      }
    }
    const check = validateEntry(parsed.type, json);
    if (!check.ok) { skipped.push({ path, reason: check.errors.join(', ') }); continue; }
    entries.push({ ...parsed, json });
  }

  return Object.freeze({
    name: typeof input.name === 'string' && input.name.trim() ? input.name.trim() : 'Data Pack',
    format: Number.isFinite(input.format) ? input.format : PREFERRED_PACK_FORMAT,
    description: typeof input.description === 'string' ? input.description : '',
    entries: Object.freeze(entries),
    skipped: Object.freeze(skipped),
    /** True when the pack declares a format this build does not target. Recorded, never a refusal. */
    get formatMismatch() { return this.format !== PREFERRED_PACK_FORMAT; },
  });
}

/**
 * Read the `pack.mcmeta` out of a set of files, if it is there.
 *
 * This is where a pack says its format, and the generators write it. Returning null rather than a default
 * keeps "declared 48" and "said nothing" distinguishable.
 */
export function readPackMeta(files) {
  const raw = files instanceof Map ? Object.fromEntries(files) : (files ?? {});
  const entry = Object.entries(raw).find(([path]) => /(^|\/)pack\.mcmeta$/.test(path.replace(/\\/g, '/')));
  if (!entry) return null;
  let json = entry[1];
  if (typeof json === 'string') {
    try { json = JSON.parse(json); } catch { return null; }
  }
  const pack = json?.pack;
  if (!pack || typeof pack !== 'object') return null;
  return {
    format: Number.isFinite(pack.pack_format) ? pack.pack_format : null,
    description: typeof pack.description === 'string' ? pack.description : '',
  };
}

/**
 * Resolve a stack of packs into one lookup.
 *
 * Later packs win, which is how a data pack works: a pack loaded on top of vanilla overrides by `namespace:id`
 * and leaves everything else alone. Nothing is merged field-by-field -- a recipe in an override pack replaces
 * the recipe, it does not contribute half of itself.
 *
 * @param {Array} packs in load order, lowest priority first
 * @returns {{byType:object, overrides:Array, errors:Array}}
 */
export function mergePacks(packs = []) {
  const byType = {};
  for (const type of Object.keys(PACK_TYPES)) byType[type] = new Map();
  const origins = new Map();     // `${type}:${id}` -> pack name, so an override can be reported
  const overrides = [];
  const errors = [];

  for (const pack of packs) {
    if (!pack || !Array.isArray(pack.entries)) { errors.push('not a data pack'); continue; }
    for (const entry of pack.entries) {
      const key = `${entry.type}:${entry.id}`;
      const previous = origins.get(key);
      if (previous) overrides.push({ type: entry.type, id: entry.id, from: previous, to: pack.name });
      origins.set(key, pack.name);
      byType[entry.type].set(entry.id, { ...entry, pack: pack.name });
    }
  }

  return { byType, overrides, errors };
}

/** How much of each type a resolved stack carries, for a report or a test. */
export function packCoverage(resolved) {
  const out = {};
  for (const [type, map] of Object.entries(resolved?.byType ?? {})) out[type] = map.size;
  return out;
}
