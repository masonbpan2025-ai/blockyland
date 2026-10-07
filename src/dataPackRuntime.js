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

/** Which packs are currently applied, in order, so the same one is not applied twice. */
const APPLIED_PACK_ORDER = [];

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
    recipes: [],
    smelting: { added: [], overwritten: [] },
    loot: { overrides: [], counts: [] },
    tags: { item_tag: [], block_tag: [] },
    dimensions: [],
    features: [],
    structures: [],
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
    if (existed) applied.biomes.overwritten.push({ key: path, previous: BIOMES[path] });
    else applied.biomes.added.push(path);
    BIOMES[path] = adapted;
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
  for (const [id, entry] of byType.structure ?? new Map()) {
    const adapted = adaptStructure(entry.json);
    if (!adapted) { applied.unresolved.push({ type: 'structure', id, reason: 'no type' }); continue; }
    const previous = PACK_STRUCTURES.get(id) ?? null;
    PACK_STRUCTURES.set(id, adapted);
    applied.structures.push({ id, previous });
  }

  APPLIED_PACK_ORDER.push(name);
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

  for (const { key, previous } of applied.biomes.overwritten) BIOMES[key] = previous;
  for (const key of applied.biomes.added) delete BIOMES[key];

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

  const at = APPLIED_PACK_ORDER.lastIndexOf(applied.name);
  if (at >= 0) APPLIED_PACK_ORDER.splice(at, 1);
  return true;
}

/** Undo the tag registry entirely, for a test or a full reset. */
export function resetTagRegistry() {
  TAG_REGISTRY.item_tag.clear();
  TAG_REGISTRY.block_tag.clear();
  DIMENSION_TYPES.clear();
  PACK_FEATURES.clear();
  PACK_STRUCTURES.clear();
  APPLIED_PACK_ORDER.length = 0;
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
  if (first && def) {
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
