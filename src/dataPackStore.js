// Keeping loaded packs, and keeping them across a reload.
//
// `dataPackRuntime` can apply a pack and take it off again, but it forgets everything the moment the page
// reloads. This is the store: which packs exist, where each came from, whether it is on, and how to write the
// whole set into a save file and read it back.
//
// The awkward part is size. A pack is arbitrary user JSON and the vanilla data pack is tens of megabytes, so
// a save that faithfully carries every loaded pack can grow without limit. Rather than truncate silently or
// refuse outright, a pack over the cap is kept for the session, marked `persisted: false`, and NAMED in the
// save record -- so a reload can tell the player exactly which packs it could not restore.

/** Where a pack came from. A bundled pack is the default content; the others are the player's. */
export const PACK_SOURCES = Object.freeze({
  BUNDLED: 'bundled',
  PASTED: 'pasted',
  UPLOADED: 'uploaded',
});

/**
 * How many bytes of a single pack are written into a save.
 *
 * Measured as the length of the serialised JSON, which for the ASCII these files are is the byte count.
 */
export const MAX_PERSISTED_PACK_BYTES = 2 * 1024 * 1024;

/** Roughly how much pack data one save may carry in total, across every pack. */
export const MAX_SAVE_PACK_BYTES = 8 * 1024 * 1024;

/** The size a pack's files take when written as JSON. */
export function packByteSize(files) {
  if (!files) return 0;
  try {
    return JSON.stringify(files).length;
  } catch {
    // A cyclic object cannot be serialised and therefore cannot be persisted. Infinity keeps it out of the
    // save rather than throwing at save time.
    return Infinity;
  }
}

/**
 * Create an empty store.
 *
 * @returns {{packs: Map<string, object>, order: string[]}}
 */
export function createPackStore() {
  return { packs: new Map(), order: [] };
}

/**
 * Add or replace a pack.
 *
 * @param {object} store
 * @param {{name:string, files:object, source?:string, format?:number, enabled?:boolean}} input
 * @returns {{ok:boolean, reason?:string, pack?:object}}
 */
export function addPack(store, input = {}) {
  if (!store?.packs) return { ok: false, reason: 'not a pack store' };
  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim() : null;
  if (!name) return { ok: false, reason: 'a pack needs a name' };
  const source = Object.values(PACK_SOURCES).includes(input.source) ? input.source : PACK_SOURCES.PASTED;
  const hasFiles = input.files && typeof input.files === 'object';
  // A bundled pack restored from a save arrives WITHOUT its files: they are on disk already, and copying a
  // megabyte of vanilla JSON into every save would be absurd. It is re-attached from the bundle instead.
  const awaitingBundle = !hasFiles && input.bundled === true;
  if (!hasFiles && !awaitingBundle) return { ok: false, reason: 'a pack needs files' };

  const bytes = hasFiles ? packByteSize(input.files) : 0;
  const pack = {
    name,
    files: hasFiles ? input.files : null,
    source,
    format: Number.isFinite(input.format) ? input.format : null,
    enabled: input.enabled !== false,
    bytes,
    awaitingBundle,
    // A bundled pack is never copied into a save, and neither is one too big for a save. A pack too large
    // still works this session; it just will not survive a reload, and says so.
    persisted: !awaitingBundle && source !== PACK_SOURCES.BUNDLED && bytes <= MAX_PERSISTED_PACK_BYTES,
  };
  if (!store.packs.has(name)) store.order.push(name);
  store.packs.set(name, pack);
  return { ok: true, pack };
}

/**
 * Give a restored bundled pack its files back.
 *
 * Called after `restorePacks` with the pack the game fetched from its own bundle, so a reload does not need
 * the megabyte to have been in the save.
 */
export function attachBundledFiles(store, name, files) {
  const pack = store?.packs?.get(name);
  if (!pack) return false;
  if (!files || typeof files !== 'object') return false;
  pack.files = files;
  pack.bytes = packByteSize(files);
  pack.awaitingBundle = false;
  return true;
}

/** Drop a pack. Applying is the caller's problem -- remove it from the game first if it is on. */
export function removePack(store, name) {
  if (!store?.packs?.has(name)) return false;
  store.packs.delete(name);
  const at = store.order.indexOf(name);
  if (at >= 0) store.order.splice(at, 1);
  return true;
}

/** Turn a pack on or off. */
export function setPackEnabled(store, name, enabled) {
  const pack = store?.packs?.get(name);
  if (!pack) return false;
  pack.enabled = enabled !== false;
  return true;
}

/** Every pack that should be applied, lowest priority first. */
export function enabledPacks(store) {
  if (!store?.packs) return [];
  return store.order.map(n => store.packs.get(n)).filter(p => p && p.enabled);
}

/** Every pack in the store, in order, for a list in the UI. */
export function allPacks(store) {
  if (!store?.packs) return [];
  return store.order.map(n => store.packs.get(n)).filter(Boolean);
}

/** Total bytes the store would write into a save. */
export function storeByteSize(store) {
  return allPacks(store).reduce((n, p) => n + (p.persisted ? p.bytes : 0), 0);
}

/** The packs a save can actually restore, and the ones it cannot. */
export function persistenceReport(store) {
  const packs = allPacks(store);
  // A bundled pack is not "too large to save" -- it is not saved at all, and it comes back from the bundle,
  // so nothing is lost. Listing it as too large would be a lie the UI would then repeat to the player.
  const bundled = packs.filter(p => p.source === PACK_SOURCES.BUNDLED);
  const others = packs.filter(p => p.source !== PACK_SOURCES.BUNDLED);
  return {
    total: packs.length,
    persisted: packs.filter(p => p.persisted).map(p => p.name),
    tooLarge: others.filter(p => !p.persisted).map(p => p.name),
    bundled: bundled.map(p => p.name),
    bytes: storeByteSize(store),
    overSaveCap: storeByteSize(store) > MAX_SAVE_PACK_BYTES,
  };
}

/**
 * The store as a save record.
 *
 * A BUNDLED pack is written as a reference -- name, source, format, enabled -- with no files at all. It ships
 * with the game, so copying a megabyte of vanilla JSON into every save would be waste, and `restorePacks`
 * re-attaches it from the bundle.
 *
 * Packs that are too large are NOT written, but they ARE named, so a reload can say which ones are missing
 * rather than quietly starting with less content than the player left.
 */
export function capturePacks(store) {
  const packs = [];
  const omitted = [];
  let bytes = 0;
  for (const pack of allPacks(store)) {
    if (pack.source === PACK_SOURCES.BUNDLED) {
      // Referenced, not carried. `pack.files` may be null if it is still awaiting the bundle.
      packs.push({ name: pack.name, source: pack.source, format: pack.format, enabled: pack.enabled, bundled: true });
      continue;
    }
    if (!pack.persisted) { omitted.push({ name: pack.name, reason: 'too large to save', bytes: pack.bytes }); continue; }
    if (bytes + pack.bytes > MAX_SAVE_PACK_BYTES) {
      omitted.push({ name: pack.name, reason: 'over the save pack budget', bytes: pack.bytes });
      continue;
    }
    bytes += pack.bytes;
    packs.push({
      name: pack.name,
      source: pack.source,
      format: pack.format,
      enabled: pack.enabled,
      files: pack.files,
    });
  }
  return { version: 1, packs, omitted, bytes };
}

/**
 * Read a save record back into a store.
 *
 * Tolerant by design: a save written by an older build has no `dataPacks` at all, and a record can be
 * malformed. Anything unusable is reported rather than thrown, so one bad pack does not cost the world.
 */
export function restorePacks(record) {
  const store = createPackStore();
  const errors = [];
  if (!record || typeof record !== 'object') return { store, errors, omitted: [], awaitingBundle: [] };
  const list = Array.isArray(record.packs) ? record.packs : [];
  const awaitingBundle = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') { errors.push('a pack entry is not an object'); continue; }
    const bundled = entry.source === PACK_SOURCES.BUNDLED;
    const result = addPack(store, {
      name: entry.name,
      files: entry.files,
      source: entry.source,
      format: entry.format,
      enabled: entry.enabled,
      // A bundled entry carries no files by design.
      bundled,
    });
    if (!result.ok) { errors.push(`${entry.name ?? '(unnamed)'}: ${result.reason}`); continue; }
    if (result.pack.awaitingBundle) awaitingBundle.push(result.pack.name);
  }
  return {
    store,
    errors,
    // Named so the UI can tell the player what a save could not carry.
    omitted: Array.isArray(record.omitted) ? record.omitted : [],
    // Bundled packs the caller should re-attach from the shipped bundle before applying.
    awaitingBundle,
  };
}

/**
 * Turn pasted or uploaded text into a pack's files.
 *
 * Two shapes are accepted, because both are what the generators produce: a single generator's output (one
 * JSON object, which needs a path invented for it) and a whole data pack (a map of path to JSON, or the
 * generator site's export).
 *
 * A single object cannot be typed into a folder, so the caller supplies the type and the id -- that is the
 * difference between "paste a biome file" and "paste a data pack".
 *
 * @returns {{ok:boolean, files?:object, errors:string[]}}
 */
export function filesFromText(text, options = {}) {
  const errors = [];
  if (typeof text !== 'string' || !text.trim()) return { ok: false, errors: ['nothing pasted'] };

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, errors: [`invalid JSON: ${err.message}`] };
  }

  // A whole pack: a map of path -> JSON.
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const keys = Object.keys(parsed);
    const looksLikePack = keys.length > 0 && keys.some(k => k.includes('/') || k === 'pack.mcmeta');
    if (looksLikePack) {
      const files = {};
      for (const [path, value] of Object.entries(parsed)) {
        files[path] = typeof value === 'string' ? value : JSON.stringify(value);
      }
      return { ok: true, files, errors };
    }
  }

  // A single generator output. The caller has to say where it belongs.
  const type = options.type;
  const namespace = typeof options.namespace === 'string' && options.namespace ? options.namespace : 'custom';
  const id = typeof options.id === 'string' && options.id ? options.id : 'pasted';
  if (!type) {
    return {
      ok: false,
      errors: ['this looks like a single generated file, so it needs a type (biome, recipe, loot_table, ...) '
        + 'and an id before it can be loaded'],
    };
  }
  const path = `${type.startsWith('data/') ? type : `data/${namespace}/${type}`}/${id}.json`;
  return { ok: true, files: { [path]: JSON.stringify(parsed) }, errors };
}
