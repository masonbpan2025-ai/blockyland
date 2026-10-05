// Resource Inspector: the block and item registry, plus the cross-references a parity check needs.
//
// Why this exists. The Mob Inspector (`src/mobDebug.js`, `src/mobDebugSession.js`,
// `src/mobShowcase.js`) made mob behaviour checkable without launching the game: a scenario spawns a
// mob, ticks it, and reports whether the behaviour was observed. Blocks and items had no equivalent,
// so an item bug -- a loot table naming an item that does not exist, a recipe whose result is a
// block with no item form, a stack size that disagrees with vanilla -- could only be found by
// playing. This module is the data half of the same idea for blocks and items.
//
// It is deliberately free of Three.js and of the DOM. `node scripts/inspect-resource.mjs` and the
// tests both drive it directly, so a check costs milliseconds and works in an environment with no
// dependencies installed at all. The browser page (`src/resourceDebug.js`) renders the same data.
//
// Two seams exist for data that lives in modules this file must not import:
//   * `smelting`  -- the hand-written furnace table lives in `furnace.js`, which imports Three.js.
//                    Callers that have it (the CLI, the page) pass it in.
//   * `durability`-- a max-durability lookup. `src/durability.js` does not exist on every branch, and
//                    a missing provider must report "unsupported" rather than a false failure.
// `EXTRA_SMELTING` is imported directly because it is three-free and is the generated table's source.
import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';
import { harvestDataFor, knownHarvestBlockIds } from './blockHarvestData.js';
import { RECIPES_2X2, RECIPES_3X3 } from './crafting.js';
import { EXTRA_RECIPES } from './extraRecipes.js';
import { EXTRA_SMELTING } from './extraSmelting.js';
import { MOB_LOOT } from './mobLootData.js';
import { BASE_BREWING_RECIPES, POTION_DATA } from './brewing.js';
import { FOODS } from './foodData.js';
import { describeTool } from './miningRules.js';
import { getItemEnchantCategory } from './enchanting.js';

/** Item types vanilla never stacks. Used only as a fallback when a definition declares nothing. */
const UNSTACKABLE_TYPES = new Set(['weapon', 'armor', 'shield', 'potion', 'transport']);

const lower = (s) => String(s).toLowerCase();

/**
 * Every block id that an item can place, and the item that places it.
 *
 * This is the join that makes the resource model work: an item entry and a block entry are the same
 * resource when the item names the block, and a recipe whose result is a block id belongs to that
 * item. `chest` and `red_bed` both name a block id, so the map keeps the first item id it sees and
 * the rest stay addressable as their own resources.
 */
function buildBlockItemMap() {
  const byBlockId = new Map();
  for (const [id, def] of Object.entries(ITEMS)) {
    if (def?.blockId === undefined) continue;
    const key = String(def.blockId);
    if (!byBlockId.has(key)) byBlockId.set(key, id);
  }
  return byBlockId;
}

/** Numeric block id -> every `BLOCKS` alias that names it, lower-cased. */
function buildBlockAliases() {
  const out = new Map();
  for (const [key, value] of Object.entries(BLOCKS)) {
    if (typeof value !== 'number') continue;
    if (!out.has(value)) out.set(value, []);
    out.get(value).push(lower(key));
  }
  return out;
}

/**
 * The stack limit this game actually applies to an item.
 *
 * `src/inventory.js` merges up to a hardcoded 64 on every path except a dropped-item pickup, and
 * only `extraItems.js` declares `stackSize` at all. Reporting the declared value separately from the
 * applied one is what lets the parity check tell "vanilla says 16 and the definition agrees" apart
 * from "vanilla says 16 and the definition says nothing, so 64 is used".
 */
function resolveStack(entry) {
  const declared = typeof entry.def?.stackSize === 'number' ? entry.def.stackSize : null;
  const fallback = UNSTACKABLE_TYPES.has(entry.def?.type) ? 1 : 64;
  return { declared, applied: declared ?? fallback };
}

/** Normalise one recipe cell (a string item id or a numeric block id) to `{id, isBlock}`. */
export function normaliseCell(cell) {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'object') {
    if (cell.id === undefined) return null;
    return { id: cell.id, isBlock: typeof cell.id === 'number' };
  }
  return { id: cell, isBlock: typeof cell === 'number' };
}

/**
 * Flatten a recipe of either shape into the terms a check needs.
 *
 * `RECIPES_2X2`/`RECIPES_3X3`/`EXTRA_RECIPES` use either a shaped `pattern` of rows or a shapeless
 * `ingredients` list, and neither is normalised anywhere else in the codebase -- `crafting.js`
 * compares grids directly. A single accessor here keeps every check from re-deriving it.
 */
export function normaliseRecipe(recipe, source = 'crafting') {
  const cells = recipe.pattern
    ? recipe.pattern.flat()
    : (recipe.ingredients ?? []);
  const ingredients = cells
    .map(normaliseCell)
    .filter(Boolean)
    .map((c) => (typeof c.id === 'number' ? c.id : String(c.id)));
  const result = normaliseCell(recipe.result);
  return {
    source,
    shapeless: Boolean(recipe.shapeless) || !recipe.pattern,
    ingredients,
    resultId: result ? result.id : null,
    resultIsBlock: result ? result.isBlock : false,
    count: recipe.result?.count ?? 1,
  };
}

/** All hand-written and generated crafting recipes, normalised once. */
export function allRecipes() {
  return [
    ...RECIPES_2X2.map((r) => normaliseRecipe(r, 'crafting-2x2')),
    ...RECIPES_3X3.map((r) => normaliseRecipe(r, 'crafting-3x3')),
    ...EXTRA_RECIPES.map((r) => normaliseRecipe(r, 'crafting-generated')),
  ];
}

/**
 * The smelting table as `input id -> output`, from the generated data plus whatever the caller
 * supplies. Keys stay in their own type: a block input is a number, an item input is a string, which
 * is exactly how `furnace.js` looks them up.
 */
export function smeltingTable(handWritten = null) {
  const out = new Map();
  for (const [key, value] of Object.entries(EXTRA_SMELTING)) {
    out.set(/^[0-9]+$/.test(key) ? Number(key) : key, { id: value.id, count: value.count ?? 1 });
  }
  // Hand-written entries win, and are merged keyed the same way `furnace.js` merges them.
  if (handWritten) {
    for (const [key, value] of Object.entries(handWritten)) {
      out.set(/^[0-9]+$/.test(key) ? Number(key) : key, { id: value.id, count: value.count ?? 1 });
    }
  }
  return out;
}

/** Every mob loot entry as `itemId -> [mobType]`, flattened from the per-mob tables. */
export function lootSources() {
  const out = new Map();
  for (const [mobType, drops] of Object.entries(MOB_LOOT)) {
    for (const drop of drops ?? []) {
      const id = Array.isArray(drop) ? drop[0] : drop;
      if (id === null || id === undefined) continue;
      const key = String(id);
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(mobType);
    }
  }
  return out;
}

/** Brewing: which potion ids are produced, and from what. */
export function brewingSources() {
  const asResult = new Map();
  const asIngredient = new Map();
  for (const row of BASE_BREWING_RECIPES) {
    if (!row?.result) continue;
    if (!asResult.has(row.result)) asResult.set(row.result, []);
    asResult.get(row.result).push(`${row.bottle} + ${row.ingredient}`);
    if (row.ingredient) {
      if (!asIngredient.has(row.ingredient)) asIngredient.set(row.ingredient, []);
      asIngredient.get(row.ingredient).push(row.result);
    }
  }
  return { asResult, asIngredient, potions: new Set(Object.keys(POTION_DATA)) };
}

/**
 * Build the resource registry.
 *
 * @param {{smelting?: object|null, durability?: ((id: string|number) => number|null)|null}} [sources]
 * @returns {object} registry with `entries`, lookup maps and the normalised cross-reference tables
 */
export function buildRegistry(sources = {}) {
  const itemForBlock = buildBlockItemMap();
  const aliases = buildBlockAliases();
  const recipes = allRecipes();
  const smelting = smeltingTable(sources.smelting ?? null);
  const brewing = brewingSources();
  const loot = lootSources();
  const durability = sources.durability ?? null;

  /** @type {Map<string, object>} */
  const entries = new Map();

  const makeEntry = (key, kind, id, def, blockId, blockDef) => {
    const entry = {
      key,
      kind,
      id,
      def: def ?? null,
      name: def?.name ?? blockDef?.name ?? String(id),
      isBlock: kind === 'block' || Boolean(def?.isBlock),
      blockId: blockId ?? null,
      blockDef: blockDef ?? null,
      blockAliases: blockId !== null ? (aliases.get(blockId) ?? []) : [],
      internal: Boolean(blockDef?.internal),
      icon: def?.icon ?? null,
      type: def?.type ?? null,
      // Filled in below, once every entry exists, so a check can query the whole registry.
      recipesAsResult: [],
      recipesAsIngredient: [],
      smeltingFrom: [],
      smeltedInto: [],
      brewingFrom: [],
      brewingInto: [],
      lootFrom: [],
      droppedBy: [],
      harvest: null,
      food: null,
      tool: null,
      enchantCategory: null,
      durabilityMax: null,
    };
    Object.assign(entry, resolveStack(entry));
    return entry;
  };

  for (const [id, def] of Object.entries(ITEMS)) {
    const blockId = def?.blockId ?? null;
    entries.set(id, makeEntry(id, 'item', id, def, blockId, blockId !== null ? (BLOCK_DEFS[blockId] ?? null) : null));
  }
  for (const [blockId, keys] of aliases) {
    if (itemForBlock.has(String(blockId))) continue;
    const def = BLOCK_DEFS[blockId];
    if (!def) continue;
    const key = `block:${blockId}`;
    if (entries.has(key)) continue;
    entries.set(key, makeEntry(key, 'block', String(blockId), null, blockId, def));
  }

  // --- cross-references ------------------------------------------------------
  //
  // A recipe names its result by item id or by block id, and an item that places a block must match
  // a recipe whose result is that block. Resolving a result to a set of resource keys once, here,
  // is what stops every check from re-implementing the join.
  const keysForBlockId = new Map();
  const keysForItemId = new Map();
  for (const entry of entries.values()) {
    if (entry.blockId !== null) {
      const k = String(entry.blockId);
      if (!keysForBlockId.has(k)) keysForBlockId.set(k, []);
      keysForBlockId.get(k).push(entry.key);
    }
    if (entry.kind === 'item') {
      if (!keysForItemId.has(entry.id)) keysForItemId.set(entry.id, []);
      keysForItemId.get(entry.id).push(entry.key);
    }
  }
  const keysForId = (id) => {
    if (typeof id === 'number') return keysForBlockId.get(String(id)) ?? [];
    const direct = keysForItemId.get(String(id));
    if (direct) return direct;
    // A recipe may name a block by its lower-case alias ("quartz"); that is still the block's item.
    const blockId = BLOCKS[String(id).toUpperCase()];
    if (typeof blockId === 'number') return keysForBlockId.get(String(blockId)) ?? [];
    return [];
  };

  for (const recipe of recipes) {
    if (recipe.resultId !== null) {
      for (const key of keysForId(recipe.resultId)) entries.get(key).recipesAsResult.push(recipe);
    }
    for (const ingredient of recipe.ingredients) {
      for (const key of keysForId(ingredient)) entries.get(key).recipesAsIngredient.push(recipe);
    }
  }
  for (const [input, output] of smelting) {
    for (const key of keysForId(input)) entries.get(key).smeltedInto.push({ input, output });
    if (output?.id !== undefined) {
      for (const key of keysForId(output.id)) entries.get(key).smeltingFrom.push({ input, output });
    }
  }
  for (const [result, from] of brewing.asResult) {
    for (const key of keysForId(result)) entries.get(key).brewingFrom.push(...from);
  }
  for (const [ingredient, into] of brewing.asIngredient) {
    for (const key of keysForId(ingredient)) entries.get(key).brewingInto.push(...into);
  }
  for (const [itemId, mobs] of loot) {
    for (const key of keysForId(itemId)) entries.get(key).lootFrom.push(...mobs);
  }

  // Which blocks drop this resource. `BLOCK_HARVEST` names drops by block name, and a block def may
  // also carry `drop`/`dropItem`; both are consulted because the two tables disagree in places.
  for (const blockId of knownHarvestBlockIds()) {
    const harvest = harvestDataFor(blockId);
    for (const dropName of harvest?.drops ?? []) {
      const targetBlockId = BLOCKS[String(dropName).toUpperCase()];
      const keys = typeof targetBlockId === 'number' ? keysForId(targetBlockId) : keysForId(dropName);
      for (const key of keys) entries.get(key).droppedBy.push(harvest.name ?? String(blockId));
    }
  }
  for (const [blockId, def] of Object.entries(BLOCK_DEFS)) {
    const drop = def?.dropItem ?? def?.drop;
    if (drop === undefined || drop === null) continue;
    const keys = keysForId(typeof drop === 'string' ? drop : Number(drop));
    for (const key of keys) {
      const entry = entries.get(key);
      const label = def.name ?? String(blockId);
      // Both tables name the same drop differently -- `BLOCK_HARVEST` says "Stone" where the block
      // definition says `stone` -- so the label is compared case-insensitively.
      if (entry && !entry.droppedBy.some((existing) => existing.toLowerCase() === label.toLowerCase())) {
        entry.droppedBy.push(label);
      }
    }
  }

  // Harvest, food, tool and enchantment facts are per-entry singletons.
  for (const entry of entries.values()) {
    if (entry.blockId !== null) entry.harvest = harvestDataFor(entry.blockId);
    if (entry.kind === 'item') {
      entry.food = FOODS[entry.id] ?? null;
      entry.tool = describeTool(entry.id);
      entry.enchantCategory = getItemEnchantCategory(entry.id) ?? null;
      if (durability) entry.durabilityMax = durability(entry.id) ?? null;
    }
  }

  const byBlockId = new Map();
  for (const entry of entries.values()) {
    if (entry.blockId !== null && !byBlockId.has(entry.blockId)) byBlockId.set(entry.blockId, entry);
  }

  return {
    entries,
    byBlockId,
    recipes,
    smelting,
    brewing,
    loot,
    durabilityProvided: Boolean(durability),
    stats: {
      items: [...entries.values()].filter((e) => e.kind === 'item').length,
      blocksOnly: [...entries.values()].filter((e) => e.kind === 'block').length,
      blockItems: [...entries.values()].filter((e) => e.blockId !== null).length,
      recipes: recipes.length,
      smelting: smelting.size,
      harvestBlocks: knownHarvestBlockIds().length,
    },
  };
}

let cached = null;

/** The default registry, built once. Pass `{fresh: true}` to rebuild after mutating game data. */
export function registry({ fresh = false, ...sources } = {}) {
  if (fresh || !cached) cached = buildRegistry(sources);
  return cached;
}

/**
 * Find a resource by any of the names a caller might have: an item id (`oak_planks`), an upper-case
 * block key (`OAK_PLANKS`), a numeric block id (`5` or `block:5`), or a display name.
 */
export function resolveResource(ref, reg = registry()) {
  if (ref === null || ref === undefined) return null;
  if (typeof ref === 'object') return ref.key ? (reg.entries.get(ref.key) ?? null) : null;
  if (typeof ref === 'number') {
    return Number.isInteger(ref) ? (reg.byBlockId.get(ref) ?? null) : null;
  }
  const key = String(ref).trim();
  // An empty or whitespace name must not fall through to `Number('')`, which is 0 -- and 0 is a
  // registered block (Air), so a caller passing an empty selection would silently inspect air.
  if (!key) return null;
  if (reg.entries.has(key)) return reg.entries.get(key);
  if (/^[0-9]+$/.test(key)) {
    const numeric = Number(key);
    if (reg.byBlockId.has(numeric)) return reg.byBlockId.get(numeric);
  }
  if (reg.entries.has(`block:${key}`)) return reg.entries.get(`block:${key}`);
  const upper = key.toUpperCase();
  if (typeof BLOCKS[upper] === 'number' && reg.byBlockId.has(BLOCKS[upper])) return reg.byBlockId.get(BLOCKS[upper]);
  const wanted = lower(key).replace(/[^a-z0-9]+/g, ' ').trim();
  if (!wanted) return null;
  for (const entry of reg.entries.values()) {
    if (lower(entry.name).replace(/[^a-z0-9]+/g, ' ').trim() === wanted) return entry;
  }
  return null;
}

/** Search by name or id, optionally restricted to items or to blocks. */
export function searchResources(text = '', { kind = null, limit = 500, reg = registry() } = {}) {
  const needle = lower(text).trim();
  const out = [];
  for (const entry of reg.entries.values()) {
    if (kind && entry.kind !== kind) continue;
    if (needle && !lower(entry.id).includes(needle) && !lower(entry.name).includes(needle)) continue;
    out.push(entry);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Everything a caller needs to inspect one resource: its definition, its derived facts, and where it
 * comes from. Plain data, so the CLI can print it and the page can render it.
 */
export function resourceReport(ref, reg = registry()) {
  const entry = resolveResource(ref, reg);
  if (!entry) return null;
  return {
    key: entry.key,
    kind: entry.kind,
    id: entry.id,
    name: entry.name,
    type: entry.type,
    isBlock: entry.isBlock,
    blockId: entry.blockId,
    blockName: entry.blockDef?.name ?? null,
    blockAliases: entry.blockAliases,
    internal: entry.internal,
    icon: entry.icon,
    stackSizeDeclared: entry.declared,
    stackSizeApplied: entry.applied,
    durabilityMax: entry.durabilityMax,
    food: entry.food,
    tool: entry.tool,
    enchantCategory: entry.enchantCategory,
    harvest: entry.harvest,
    definition: entry.def ?? entry.blockDef ?? null,
    blockDefinition: entry.blockDef ?? null,
    sources: {
      crafting: entry.recipesAsResult.map((r) => ({
        source: r.source,
        shapeless: r.shapeless,
        count: r.count,
        ingredients: r.ingredients,
      })),
      smelting: entry.smeltingFrom.map((s) => ({ from: s.input, count: s.output?.count ?? 1 })),
      brewing: entry.brewingFrom.slice(),
      mobLoot: entry.lootFrom.slice(),
      blockDrops: entry.droppedBy.slice(),
    },
    usedAs: {
      craftingIngredient: entry.recipesAsIngredient.length,
      smeltedInto: entry.smeltedInto.length,
      brewingIngredient: entry.brewingInto.length,
    },
  };
}

/**
 * Ids that are referenced by game data but have no definition.
 *
 * This is the class of bug the audit found by hand: `mobLootData.js` and `foodData.js` both name
 * `rotten_flesh`, `wanderingTraderBehavior.js` hands over `oak_sapling`, and `furnace.js` registers a
 * fuel entry under the key `undefined` -- none of which exists, and none of which any existing test
 * could see. A reference to a missing id is invisible at runtime (the drop renders as the fallback
 * sprite and becomes a phantom item), so it is reported here instead.
 *
 * @returns {Array<{kind: string, from: string, id: string|number, detail: string}>}
 */
export function danglingReferences(reg = registry()) {
  const problems = [];
  const has = (id) => {
    if (id === null || id === undefined) return true;
    if (typeof id === 'number') return BLOCK_DEFS[id] !== undefined;
    const key = String(id);
    if (ITEMS[key] !== undefined) return true;
    if (BLOCK_DEFS[key] !== undefined) return true;
    if (typeof BLOCKS[key.toUpperCase()] === 'number') return true;
    return false;
  };

  for (const [id, def] of Object.entries(ITEMS)) {
    if (def?.blockId !== undefined && BLOCK_DEFS[def.blockId] === undefined) {
      problems.push({ kind: 'item-block', from: `ITEMS.${id}.blockId`, id: def.blockId, detail: 'item places a block that has no definition' });
    }
  }
  for (const [blockId, def] of Object.entries(BLOCK_DEFS)) {
    for (const field of ['dropItem', 'drop']) {
      const value = def?.[field];
      if (typeof value !== 'string') continue;
      if (!has(value)) {
        problems.push({ kind: 'block-drop', from: `BLOCK_DEFS[${blockId}].${field}`, id: value, detail: `${def.name ?? blockId} drops an item that does not exist` });
      }
    }
  }
  for (const recipe of reg.recipes) {
    if (recipe.resultId !== null && !has(recipe.resultId) && !hasResultBlock(recipe.resultId)) {
      problems.push({ kind: 'recipe-result', from: recipe.source, id: recipe.resultId, detail: 'recipe produces an id with no definition' });
    }
    for (const ingredient of recipe.ingredients) {
      if (!has(ingredient) && !hasResultBlock(ingredient)) {
        problems.push({ kind: 'recipe-ingredient', from: recipe.source, id: ingredient, detail: 'recipe consumes an id with no definition' });
      }
    }
  }
  for (const [input, output] of reg.smelting) {
    if (!has(input) && !hasResultBlock(input)) {
      problems.push({ kind: 'smelting-input', from: 'smelting', id: input, detail: 'smelting input has no definition' });
    }
    if (output?.id !== undefined && !has(output.id) && !hasResultBlock(output.id)) {
      problems.push({ kind: 'smelting-output', from: 'smelting', id: output.id, detail: 'smelting output has no definition' });
    }
  }
  for (const [mobType, drops] of Object.entries(MOB_LOOT)) {
    for (const drop of drops ?? []) {
      const id = Array.isArray(drop) ? drop[0] : drop;
      if (!has(id) && !hasResultBlock(id)) {
        problems.push({ kind: 'mob-loot', from: `MOB_LOOT.${mobType}`, id, detail: `${mobType} drops an item that does not exist` });
      }
    }
  }
  for (const row of BASE_BREWING_RECIPES) {
    for (const field of ['bottle', 'ingredient', 'result']) {
      const id = row?.[field];
      if (id !== undefined && !has(id) && !hasResultBlock(id)) {
        problems.push({ kind: 'brewing', from: 'BASE_BREWING_RECIPES', id, detail: `${field} of a brewing recipe has no definition` });
      }
    }
  }
  for (const blockId of knownHarvestBlockIds()) {
    const harvest = harvestDataFor(blockId);
    for (const dropName of harvest?.drops ?? []) {
      if (!has(dropName) && !hasResultBlock(dropName)) {
        problems.push({ kind: 'harvest-drop', from: `BLOCK_HARVEST.${harvest.name ?? blockId}`, id: dropName, detail: 'harvest drop has no definition' });
      }
    }
  }
  // A name is only "defined" if some entry, recipe term or block alias can be resolved from it; the
  // check above accepts a matching BLOCKS alias, which is how harvest names are written.
  for (const [id] of Object.entries(FOODS)) {
    if (ITEMS[id] === undefined) {
      problems.push({ kind: 'food', from: `FOODS.${id}`, id, detail: 'food value is declared for an item that does not exist' });
    }
  }
  // Deduplicate: the same missing id is usually referenced from several places, and the report is
  // more useful grouped by id than listed per reference.
  const seen = new Set();
  return problems.filter((p) => {
    const k = `${p.kind}|${p.id}|${p.from}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * A numeric id is "defined" when it is a registered block def; named ids also accept a block alias.
 */
function hasResultBlock(id) {
  if (typeof id === 'number') return BLOCK_DEFS[id] !== undefined;
  const key = String(id);
  if (BLOCK_DEFS[key] !== undefined) return true;
  const upper = key.toUpperCase();
  return typeof BLOCKS[upper] === 'number' && BLOCK_DEFS[BLOCKS[upper]] !== undefined;
}

/**
 * The other direction: vanilla item names this game does not answer to.
 *
 * `danglingReferences` asks "does this game reference something it never defined"; this asks "does
 * vanilla define something this game never added". Both are needed to pick parity work: the first
 * finds silent bugs, the second finds the batches worth implementing.
 *
 * A name counts as present when an `ITEMS` entry or a `BLOCKS` alias answers to it, because a block
 * reachable only by numeric id still exists as an item in the inventory.
 *
 * @param {object} reg
 * @param {{itemNames: string[]}} vanilla from `buildVanillaIndex`
 * @returns {string[]} vanilla names with no counterpart, in vanilla's order
 */
export function missingVanillaItems(reg = registry(), vanilla = null) {
  if (!vanilla?.itemNames) return [];
  const missing = [];
  for (const name of vanilla.itemNames) {
    if (name === 'air') continue;
    const snake = lower(name);
    if (ITEMS[snake] !== undefined) continue;
    const blockId = BLOCKS[snake.toUpperCase()];
    if (typeof blockId === 'number' && BLOCK_DEFS[blockId] !== undefined) continue;
    if (resolveResource(snake, reg)) continue;
    missing.push(name);
  }
  return missing;
}
