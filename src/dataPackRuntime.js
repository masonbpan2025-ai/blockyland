// Applying a data pack to the live game.
//
// `dataPack.js` says what a file is and `dataPackAdapters.js` says what it means. This is the part that
// actually changes the world: it writes adapted entries into the registries the game reads at runtime, and --
// because a pack can be turned off again -- records exactly what it touched so the change can be undone
// without a reload.
//
// Every registry this writes to is a mutable `const` object or array, which is what makes a runtime pack
// possible at all: `BIOMES`, `RECIPES_2X2`, `RECIPES_3X3`, `SMELTING_RECIPES`, `DROP_ITEM_OVERRIDES` and
// `BASE_DROP_COUNTS` are all exported as bindings that cannot be reassigned but whose contents can change.
import { BIOMES, getBiomeDef } from './biomes.js';
import { RECIPES_2X2, RECIPES_3X3 } from './crafting.js';
import { SMELTING_RECIPES } from './furnace.js';
import { DROP_ITEM_OVERRIDES, BASE_DROP_COUNTS, bonusKeyFor } from './blockDrops.js';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import {
  adaptBiome, adaptRecipe, adaptLootTable, adaptTag, adaptDimensionType,
  adaptPlacedFeature, adaptStructure, createTagExpander, resetAdapterCaches,
} from './dataPackAdapters.js';
import { normaliseId } from './dataPack.js';
import {
  setPackBiomeSpawns, clearPackBiomeSpawns, packBiomeSpawnsFor, resetPackBiomeSpawns,
} from './spawning/packBiomeSpawns.js';

/**
 * Tags a pack has loaded, by kind.
 *
 * There was no tag registry at all -- nothing in the game resolved `#minecraft:oak_logs`. A pack's tags live
 * here, and `itemTag`/`blockTag` are the accessors a consumer should use rather than reading the maps.
 */
export const TAG_REGISTRY = {
  item_tag: new Map(),
  block_tag: new Map(),
};

/** Dimension types a pack has loaded, by id. */
export const DIMENSION_TYPES = new Map();

/** Placed features and structures a pack has loaded. No generator consumes these yet. */
export const PACK_FEATURES = new Map();
export const PACK_STRUCTURES = new Map();

/**
 * Structure SETS a pack has loaded, by id.
 *
 * Loaded for one reason: an empty set is how a pack says "this world has no structures at all". Without it
 * the two cases are indistinguishable -- a pack that carries no structure files and a pack that deliberately
 * wants none both leave `PACK_STRUCTURES` empty -- and `enabledStructureIds` falls back to the baked three,
 * so a preset advertising a structureless world silently generated villages.
 */
export const PACK_STRUCTURE_SETS = new Map();

/**
 * A monotonic stamp for each applied pack that carries structure data.
 *
 * Structure sets PRECEDE by pack, they do not merge. With the bundled vanilla pack and a chosen preset both
 * applied, merging gave every preset vanilla's thirty-odd structures plus its own -- so "Dungeon Rush" and
 * "Lush Havens" ended up enabling the same set and the structure half of a preset meant nothing. The highest
 * stamp wins, which is the same rule `applyStore` already uses for registries: the later pack overrides.
 */
let PACK_STAMP = 0;

/** The highest stamp present among structure entries, or 0 when there are none. */
function highestStamp(registry) {
  let highest = 0;
  for (const entry of registry.values()) {
    if (Number.isFinite(entry?.packStamp) && entry.packStamp > highest) highest = entry.packStamp;
  }
  return highest;
}

/**
 * The highest stamp across BOTH structure registries.
 *
 * Shared on purpose. A pack's stamp is assigned once and written to everything it contributes, so a pack that
 * carries only a structure SET -- which is how "no structures" is expressed -- has to be able to outrank an
 * earlier pack's structure ENTRIES. Reading only one registry let vanilla's thirty-odd structures keep winning
 * over a preset that had explicitly asked for none.
 */
export function structurePackStamp() {
  return Math.max(highestStamp(PACK_STRUCTURES), highestStamp(PACK_STRUCTURE_SETS));
}

/**
 * The structure ids the WINNING pack carries -- the highest stamp, not every id from every pack.
 *
 * @returns {string[]} namespaced ids, as stored
 */
export function winningStructureIds() {
  const highest = structurePackStamp();
  if (highest === 0) return [];
  const out = [];
  for (const [id, entry] of PACK_STRUCTURES) {
    if (entry?.packStamp === highest) out.push(id);
  }
  return out;
}

/**
 * True when the WINNING pack's structure sets are all empty, i.e. it wants no structures.
 *
 * Precedence matters here too: the bundled vanilla pack carries no structure sets, so a preset saying
 * "none" is not contradicted by it. If it were the other way round -- vanilla declaring a set and a preset
 * declaring none -- the preset is the later pack and its answer has to win.
 */
export function packSuppressesStructures() {
  const highest = structurePackStamp();
  if (highest === 0) return false;
  for (const set of PACK_STRUCTURE_SETS.values()) {
    if (set?.packStamp !== highest) continue;
    if (Array.isArray(set?.structures) && set.structures.length === 0) return true;
  }
  return false;
}

/** Which packs are currently applied, in order, so the same one is not applied twice. */
const APPLIED_PACK_ORDER = [];

/**
 * Every applied record, in apply order, so a revert can REBUILD a key rather than undo it blindly.
 *
 * Reverting by restoring `previous` is only correct when reverts happen in reverse apply order. Reverting in
 * apply order -- which is what `t.after` hooks do, in registration order -- leaves an intermediate pack's
 * value installed: reverting A is skipped because B owns the key, then reverting B restores B's `previous`,
 * which is A's value. A pack's terrain stayed in the world with no pack claiming it.
 *
 * So a key's value is recomputed instead: the installed value of the highest still-applied pack that touched
 * it, or the ENGINE's original when none remain. That is correct for any revert order and idempotent.
 */
const APPLIED_RECORDS = [];

/** `key -> {existed, value}`: what a key held before ANY pack touched it. */
const KEY_ORIGINALS = new Map();

/** Remember what a key held the first time a pack is about to change it. */
function rememberOriginal(key, existed, value) {
  if (KEY_ORIGINALS.has(key)) return;
  KEY_ORIGINALS.set(key, { existed, value });
}

/** The entry a record holds for a biome key, whether it added it or overwrote it. */
function biomeEntry(record, key) {
  return record?.biomes?.added?.find(b => b.key === key)
    ?? record?.biomes?.overwritten?.find(b => b.key === key)
    ?? null;
}

/** Recompute one biome key from the still-applied records, or restore the engine's own value. */
function rebuildBiome(key) {
  for (let i = APPLIED_RECORDS.length - 1; i >= 0; i--) {
    const entry = biomeEntry(APPLIED_RECORDS[i], key);
    if (entry) { BIOMES[key] = entry.installed; return; }
  }
  const original = KEY_ORIGINALS.get(key);
  if (!original) return;
  if (original.existed) BIOMES[key] = original.value;
  else delete BIOMES[key];
  // Nothing owns the key any more, so the remembered original is spent. Keeping it would make a later pack
  // "restore" a value from a world that had already moved on.
  KEY_ORIGINALS.delete(key);
}

/** The same, for a biome's spawn table. */
function rebuildSpawns(biomeId) {
  for (let i = APPLIED_RECORDS.length - 1; i >= 0; i--) {
    const entry = APPLIED_RECORDS[i]?.spawns?.find(s => s.biomeId === biomeId);
    if (entry) { setPackBiomeSpawns(biomeId, entry.installed); return; }
  }
  clearPackBiomeSpawns(biomeId);
}

/** Every tag a pack named, so a consumer can ask "what does `#minecraft:logs` hold". */
export function itemTag(tag) {
  const expand = createTagExpander({ byType: { item_tag: TAG_REGISTRY.item_tag } }, 'item_tag');
  return expand(tag);
}

export function blockTag(tag) {
  const expand = createTagExpander({ byType: { block_tag: TAG_REGISTRY.block_tag } }, 'block_tag');
  return expand(tag);
}

/** The packs applied right now, lowest priority first. */
export function appliedPackNames() {
  return [...APPLIED_PACK_ORDER];
}

/** Has this pack already been applied? Applying twice would duplicate every recipe it carries. */
export function isPackApplied(name) {
  return APPLIED_PACK_ORDER.includes(name);
}

/**
 * Apply a resolved pack stack to the running game.
 *
 * @param {{byType:object}} resolved from `mergePacks`
 * @param {{name?:string, recipeLimit?:number, onWarn?:(message:string)=>void}} [options]
 * @returns {object} a record of everything that changed, for `revertDataPack` and for a report
 */
export function applyDataPack(resolved, options = {}) {
  const name = typeof options.name === 'string' && options.name ? options.name : 'Data Pack';
  const warn = typeof options.onWarn === 'function' ? options.onWarn : () => {};

  const applied = {
    name,
    skipped: false,
    reason: null,
    biomes: { added: [], overwritten: [] },
    spawns: [],
    recipes: [],
    smelting: { added: [], overwritten: [] },
    loot: { overrides: [], counts: [] },
    tags: { item_tag: [], block_tag: [] },
    dimensions: [],
    features: [],
    structures: [],
    structureSets: [],
    unresolved: [],
    warnings: [],
  };

  if (!resolved?.byType) {
    applied.skipped = true;
    applied.reason = 'not a resolved pack stack';
    return applied;
  }
  if (isPackApplied(name)) {
    applied.skipped = true;
    applied.reason = 'already applied';
    return applied;
  }

  const byType = resolved.byType;
  const note = (message) => { applied.warnings.push(message); warn(message); };

  // --- tags FIRST ---------------------------------------------------------------------------------
  //
  // Recipes reference tags, so the tag registry has to be filled before any recipe is adapted. Doing this
  // second was the reason every tag-based recipe came out with zero variants.
  for (const kind of ['item_tag', 'block_tag']) {
    for (const [id, entry] of byType[kind] ?? new Map()) {
      const adapted = adaptTag(entry.json);
      if (!adapted) { applied.unresolved.push({ type: kind, id, reason: 'no values array' }); continue; }
      const previous = TAG_REGISTRY[kind].get(id) ?? null;
      TAG_REGISTRY[kind].set(id, adapted);
      applied.tags[kind].push({ id, previous });
    }
  }
  // The adapter caches the block index, and a pack cannot change the registry, so no reset is needed here.

  // --- biomes -------------------------------------------------------------------------------------
  const expandItemTag = createTagExpander({ byType: { item_tag: TAG_REGISTRY.item_tag } }, 'item_tag');
  for (const [id, entry] of byType.biome ?? new Map()) {
    const path = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
    // The vanilla file says nothing about terrain, so the nearest game biome supplies those fields. Falling
    // back to plains when there is no name match is the documented behaviour of `getBiomeDef`.
    const fallback = getBiomeDef(path);
    const adapted = adaptBiome(entry.json, fallback);
    if (!adapted) { applied.unresolved.push({ type: 'biome', id, reason: 'not a biome object' }); continue; }
    adapted.id = path;
    const existed = Object.prototype.hasOwnProperty.call(BIOMES, path);
    // A biome the file does not name takes its display name from its own id. Inheriting the fallback's name
    // is wrong: `getBiomeDef('mushroom_island')` falls back to plains, so a brand-new biome was announced as
    // "Plains". Only the TERRAIN fields are meant to be inherited.
    if (!existed) {
      adapted.name = titleFrom(path);
      adapted.category = adapted.category ?? fallback?.category ?? 'overworld';
    } else {
      adapted.name = adapted.name ?? fallback?.name ?? titleFrom(path);
    }
    if (!adapted.dimension) adapted.dimension = fallback?.dimension ?? 'overworld';
    adapted.fromDataPack = true;
    adapted.packName = name;
    // The engine's own value for this key, remembered the first time any pack touches it, so a rebuild can
    // put it back once the last pack owning the key is gone.
    rememberOriginal(path, existed, existed ? BIOMES[path] : undefined);
    if (existed) applied.biomes.overwritten.push({ key: path, previous: BIOMES[path], installed: adapted });
    else applied.biomes.added.push({ key: path, installed: adapted });
    BIOMES[path] = adapted;

    // The spawn table, which is what natural spawning reads. `BIOMES[x].mobs` is a flat list of names and
    // carries no weights, so it cannot drive spawning; the resolver reads this registry instead.
    if (adapted.spawners) {
      const previous = packBiomeSpawnsFor(path);
      const installed = adapted.spawners;
      setPackBiomeSpawns(path, installed);
      applied.spawns.push({ biomeId: path, previous, installed });
    }
  }

  // --- recipes ------------------------------------------------------------------------------------
  const variantLimit = options.recipeLimit ?? 64;
  let recipeIndex = 0;
  for (const [id, entry] of byType.recipe ?? new Map()) {
    const adapted = adaptRecipe(entry.json, { expandTag: expandItemTag, variantLimit });
    if (!adapted) { applied.unresolved.push({ type: 'recipe', id, reason: 'unrecognised recipe' }); continue; }
    if (adapted.unsupported) continue;      // a real vanilla type with no station here
    if (adapted.input) {
      // Cooking. The game's smelting table is keyed by input and holds only the output.
      const previous = SMELTING_RECIPES[adapted.input] ?? null;
      const existed = Object.prototype.hasOwnProperty.call(SMELTING_RECIPES, adapted.input);
      SMELTING_RECIPES[adapted.input] = adapted.result;
      (existed ? applied.smelting.overwritten : applied.smelting.added)
        .push({ input: adapted.input, previous, result: adapted.result, xp: adapted.xp, seconds: adapted.seconds });
      continue;
    }
    const list = adapted.grid === '2x2' ? RECIPES_2X2 : RECIPES_3X3;
    if (adapted.recipes.length === 0) {
      applied.unresolved.push({
        type: 'recipe', id,
        reason: adapted.tags.length ? `needs a tag not in the pack: ${adapted.tags.join(', ')}` : 'no variants',
      });
      continue;
    }
    const fromIndex = list.length;
    for (const recipe of adapted.recipes) list.push({ ...recipe, fromDataPack: true, packName: name });
    applied.recipes.push({ list, fromIndex, id, count: adapted.recipes.length, grid: adapted.grid, capped: adapted.capped === true });
    if (adapted.capped) note(`recipe ${id} hit the ${variantLimit}-variant cap`);
    recipeIndex++;
  }

  // --- loot tables --------------------------------------------------------------------------------
  const { baseBlockDrop } = {};   // not needed: the key is derived from the block name
  for (const [id, entry] of byType.loot_table ?? new Map()) {
    const adapted = adaptLootTable(entry.json);
    if (!adapted) { applied.unresolved.push({ type: 'loot_table', id, reason: 'no pools' }); continue; }
    // A loot table for a BLOCK applies to that block. `loot_table/blocks/oak_log` is the vanilla path, and
    // the id keeps `blocks/oak_log`, so the block name is the last segment.
    const path = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
    const leaf = path.split('/').pop();
    const blockId = resolveBlockId(leaf);
    if (blockId === null) {
      // Not a block table -- an entity or a chest. Recorded rather than forced onto a block.
      applied.unresolved.push({ type: 'loot_table', id, reason: 'no block of that name' });
      continue;
    }
    applied.loot.overrides.push(applyLootToBlock(blockId, adapted, name));
    if (adapted.unresolved.length) {
      applied.unresolved.push({ type: 'loot_table', id, reason: `items the game lacks: ${adapted.unresolved.join(', ')}` });
    }
  }

  // --- dimension types, features, structures ------------------------------------------------------
  for (const [id, entry] of byType.dimension_type ?? new Map()) {
    const adapted = adaptDimensionType(entry.json);
    if (!adapted) { applied.unresolved.push({ type: 'dimension_type', id, reason: 'not an object' }); continue; }
    const previous = DIMENSION_TYPES.get(id) ?? null;
    DIMENSION_TYPES.set(id, adapted);
    applied.dimensions.push({ id, previous });
  }
  for (const [id, entry] of byType.placed_feature ?? new Map()) {
    const adapted = adaptPlacedFeature(entry.json);
    if (!adapted) { applied.unresolved.push({ type: 'placed_feature', id, reason: 'no feature' }); continue; }
    const previous = PACK_FEATURES.get(id) ?? null;
    PACK_FEATURES.set(id, adapted);
    applied.features.push({ id, previous });
  }
  // One stamp for this pack, shared by its structure entries and its structure sets, so precedence between
  // packs is decided by which pack this is rather than by which file happened to be read last.
  const structuresFromThisPack = (byType.structure?.size ?? 0) > 0 || (byType.structure_set?.size ?? 0) > 0;
  const stamp = structuresFromThisPack ? ++PACK_STAMP : 0;

  for (const [id, entry] of byType.structure ?? new Map()) {
    const adapted = adaptStructure(entry.json);
    if (!adapted) { applied.unresolved.push({ type: 'structure', id, reason: 'no type' }); continue; }
    const previous = PACK_STRUCTURES.get(id) ?? null;
    PACK_STRUCTURES.set(id, { ...adapted, packStamp: stamp });
    applied.structures.push({ id, previous });
  }
  for (const [id, entry] of byType.structure_set ?? new Map()) {
    const json = entry.json;
    if (!json || typeof json !== 'object') continue;
    // Only `structures` matters here: an EMPTY array is the pack saying "no structures at all", which is a
    // statement `enabledStructureIds` needs to be able to tell apart from silence.
    const adapted = { structures: Array.isArray(json.structures) ? json.structures : [], packStamp: stamp };
    const previous = PACK_STRUCTURE_SETS.get(id) ?? null;
    PACK_STRUCTURE_SETS.set(id, adapted);
    applied.structureSets.push({ id, previous });
  }

  APPLIED_PACK_ORDER.push(name);
  // The record joins the rebuild stack, so a later revert in ANY order can recompute what a key should hold.
  APPLIED_RECORDS.push(applied);
  applied.recipeCount = applied.recipes.reduce((n, r) => n + r.count, 0);
  return applied;
}

/**
 * Undo everything `applyDataPack` did.
 *
 * Exact rather than approximate: a biome the pack OVERWROTE is restored to the object it replaced, and a
 * recipe list is truncated to the length it had, because the new recipes were appended contiguously.
 */
export function revertDataPack(applied) {
  if (!applied || applied.skipped) return false;

  // ORDER-SAFE, and idempotent, by REBUILDING rather than by undoing.
  //
  // Restoring each pack's `previous` is only correct when reverts happen in reverse apply order. Reverting in
  // apply order -- which is what `t.after` hooks do, in registration order -- left an intermediate pack's
  // value installed: reverting A was skipped because B owned the key, then reverting B restored B's
  // `previous`, which was A's value. A preset's terrain stayed in the world with no pack claiming it.
  //
  // So the record is withdrawn FIRST and each key it touched is recomputed from what is left: the installed
  // value of the highest still-applied pack that touched it, or the engine's original when none remain.
  const recordIndex = APPLIED_RECORDS.indexOf(applied);
  if (recordIndex >= 0) APPLIED_RECORDS.splice(recordIndex, 1);

  const touchedBiomes = new Set([
    ...applied.biomes.overwritten.map(b => b.key),
    ...applied.biomes.added.map(b => b.key),
  ]);
  for (const key of touchedBiomes) rebuildBiome(key);

  // Spawn tables are recomputed after the biomes they came from, so a failure part-way leaves the registry
  // consistent with what the biome objects say rather than the other way round.
  for (const { biomeId } of applied.spawns) rebuildSpawns(biomeId);

  // Truncate from the end, deepest index first, so earlier indices stay valid.
  for (const record of [...applied.recipes].sort((a, b) => b.fromIndex - a.fromIndex)) {
    record.list.length = record.fromIndex;
  }

  for (const { input, previous } of applied.smelting.overwritten) SMELTING_RECIPES[input] = previous;
  for (const { input } of applied.smelting.added) delete SMELTING_RECIPES[input];

  for (const record of applied.loot.overrides) undoLootOverride(record);

  for (const kind of ['item_tag', 'block_tag']) {
    for (const { id, previous } of applied.tags[kind]) {
      if (previous) TAG_REGISTRY[kind].set(id, previous);
      else TAG_REGISTRY[kind].delete(id);
    }
  }
  for (const { id, previous } of applied.dimensions) {
    if (previous) DIMENSION_TYPES.set(id, previous); else DIMENSION_TYPES.delete(id);
  }
  for (const { id, previous } of applied.features) {
    if (previous) PACK_FEATURES.set(id, previous); else PACK_FEATURES.delete(id);
  }
  for (const { id, previous } of applied.structures) {
    if (previous) PACK_STRUCTURES.set(id, previous); else PACK_STRUCTURES.delete(id);
  }
  for (const { id, previous } of applied.structureSets ?? []) {
    if (previous) PACK_STRUCTURE_SETS.set(id, previous); else PACK_STRUCTURE_SETS.delete(id);
  }

  const at = APPLIED_PACK_ORDER.lastIndexOf(applied.name);
  if (at >= 0) APPLIED_PACK_ORDER.splice(at, 1);
  return true;
}

/** Undo the tag registry entirely, for a test or a full reset. */
export function resetTagRegistry() {
  // RESTORE FIRST, then forget. Clearing the bookkeeping while packs are still applied would strand their
  // values: a later `revertDataPack` would find no records and no remembered original, and would leave the
  // pack's terrain in the world permanently. That is exactly what happened when a test registered two
  // reverts and the first one's cleanup wiped the state the second one needed.
  for (const [key, original] of KEY_ORIGINALS) {
    if (original.existed) BIOMES[key] = original.value;
    else delete BIOMES[key];
  }
  KEY_ORIGINALS.clear();
  APPLIED_RECORDS.length = 0;

  TAG_REGISTRY.item_tag.clear();
  TAG_REGISTRY.block_tag.clear();
  DIMENSION_TYPES.clear();
  PACK_FEATURES.clear();
  PACK_STRUCTURES.clear();
  PACK_STRUCTURE_SETS.clear();
  APPLIED_PACK_ORDER.length = 0;
  resetPackBiomeSpawns();
  resetAdapterCaches();
}

/** A block id for a vanilla block name, or null when the game has no such block. */
function resolveBlockId(name) {
  if (typeof name !== 'string' || !name) return null;
  const upper = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  return typeof BLOCKS[upper] === 'number' ? BLOCKS[upper] : null;
}

/**
 * Write one adapted loot table onto a block.
 *
 * The game's model has three ideas and the table has three: a guaranteed single drop becomes the block's
 * `drop`, a count range becomes `BASE_DROP_COUNTS`, and a conditional extra becomes a `BONUS_DROPS` roll. A
 * table with several guaranteed drops cannot be expressed at all -- the game has one base drop -- so the
 * extra ones are recorded as unresolved rather than silently dropped.
 */
function applyLootToBlock(blockId, adapted, packName) {
  const key = bonusKeyFor(blockId);
  const def = BLOCK_DEFS[blockId];
  const record = {
    key, blockId,
    override: { had: Object.prototype.hasOwnProperty.call(DROP_ITEM_OVERRIDES, key), previous: DROP_ITEM_OVERRIDES[key] },
    count: { had: Object.prototype.hasOwnProperty.call(BASE_DROP_COUNTS, key), previous: BASE_DROP_COUNTS[key] },
    dropItem: { had: def ? Object.prototype.hasOwnProperty.call(def, 'dropItem') : false, previous: def?.dropItem },
    drop: { had: def ? Object.prototype.hasOwnProperty.call(def, 'drop') : false, previous: def?.drop },
  };

  const first = adapted.guaranteed[0] ?? adapted.pooled[0] ?? null;
  if (def && !first) {
    // A loot table with no drops at all. `baseBlockDrop` reads `def.drop === null` as "deliberately gives
    // nothing", which is exactly what the file says -- budding amethyst, cake, fire and frogspawn are the
    // vanilla cases. Without this the block kept its old drop and the table meant nothing.
    delete DROP_ITEM_OVERRIDES[key];
    delete BASE_DROP_COUNTS[key];
    delete def.dropItem;
    def.drop = null;
    record.dropsNothing = true;
  } else if (first && def) {
    // A block whose drop is an ITEM names it in `dropItem`; a block that drops itself is already right.
    if (first.id !== blockId || first.isBlock === false) {
      if (first.isBlock) {
        DROP_ITEM_OVERRIDES[key] = first.id;
        def.dropItem = undefined;
      } else {
        def.dropItem = first.id;
        delete DROP_ITEM_OVERRIDES[key];
      }
    }
    if (first.max > first.min) BASE_DROP_COUNTS[key] = [first.min, first.max];
    else delete BASE_DROP_COUNTS[key];
  }
  record.packName = packName;
  record.droppedExtra = Math.max(0, adapted.guaranteed.length - 1);
  return record;
}

function undoLootOverride(record) {
  if (!record) return;
  const { key, blockId } = record;
  if (record.override.had) DROP_ITEM_OVERRIDES[key] = record.override.previous;
  else delete DROP_ITEM_OVERRIDES[key];
  if (record.count.had) BASE_DROP_COUNTS[key] = record.count.previous;
  else delete BASE_DROP_COUNTS[key];
  const def = BLOCK_DEFS[blockId];
  if (!def) return;
  if (record.dropItem.had) def.dropItem = record.dropItem.previous;
  else delete def.dropItem;
  if (record.drop.had) def.drop = record.drop.previous;
  else delete def.drop;
}

/** `pale_oak_leaves` -> `Pale Oak Leaves`, for a biome the file gives no display name for. */
function titleFrom(path) {
  return String(path).split(/[_/]/).map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
}

/**
 * A one-line summary of what a pack changed, for a chat message or a test.
 */
export function describeApplied(applied) {
  if (!applied) return 'nothing applied';
  if (applied.skipped) return `${applied.name}: skipped (${applied.reason})`;
  const bits = [];
  if (applied.biomes.added.length || applied.biomes.overwritten.length) {
    bits.push(`${applied.biomes.added.length} biome(s) added, ${applied.biomes.overwritten.length} overridden`);
  }
  if (applied.recipeCount) bits.push(`${applied.recipeCount} recipe(s)`);
  if (applied.smelting.added.length || applied.smelting.overwritten.length) {
    bits.push(`${applied.smelting.added.length + applied.smelting.overwritten.length} smelting recipe(s)`);
  }
  if (applied.loot.overrides.length) bits.push(`${applied.loot.overrides.length} loot table(s)`);
  const tags = applied.tags.item_tag.length + applied.tags.block_tag.length;
  if (tags) bits.push(`${tags} tag(s)`);
  if (applied.dimensions.length) bits.push(`${applied.dimensions.length} dimension type(s)`);
  if (applied.features.length) bits.push(`${applied.features.length} placed feature(s)`);
  if (applied.structures.length) bits.push(`${applied.structures.length} structure(s)`);
  if (applied.unresolved.length) bits.push(`${applied.unresolved.length} unresolved`);
  return bits.length ? `${applied.name}: ${bits.join(', ')}` : `${applied.name}: nothing to apply`;
}
