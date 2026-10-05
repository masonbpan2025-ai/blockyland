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
import { BLOCKS, BLOCK_DEFS, ITEMS, stackLimitFor } from './blocks.js';
import { harvestDataFor, knownHarvestBlockIds, knownHarvestNames, BLOCK_HARVEST } from './blockHarvestData.js';
import { BONUS_DROPS, REPLACEMENT_DROPS, baseBlockDrop, bonusKeyFor } from './blockDrops.js';
import { RECIPES_2X2, RECIPES_3X3 } from './crafting.js';
import { EXTRA_RECIPES } from './extraRecipes.js';
import { EXTRA_SMELTING } from './extraSmelting.js';
import { MOB_LOOT } from './mobLootData.js';
import { CREEPER_DISC_POOL } from './musicDiscs.js';
import { NETHERITE_UPGRADE, NETHERITE_UPGRADE_TEMPLATE, NETHERITE_INGOT } from './smithing.js';
import { BASE_BREWING_RECIPES, POTION_DATA, getBrewingResult } from './brewing.js';
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
 * The stack limit this game applies to an item, and what the definition declares.
 *
 * `declared` is what `ITEMS[id].stackSize` says and `applied` is what the inventory actually uses.
 * Reporting both is what lets the parity check tell "vanilla says 16 and the definition agrees" apart
 * from "vanilla says 16 and nothing declares it, so 64 is used" -- which was the state of 93 items
 * before the limits were written down.
 *
 * The applied value now comes from `stackLimitFor`, the same function the inventory and the container
 * UIs use. It used to be a second copy of the rule in this file, which is exactly how the two drifted:
 * the inventory merged to a literal 64 while this reported 1 for a tool.
 */
function resolveStack(entry) {
  const declared = typeof entry.def?.stackSize === 'number' ? entry.def.stackSize : null;
  const applied = entry.blockId !== null && entry.kind !== 'item'
    ? 64
    : stackLimitFor(entry.id);
  return { declared, applied };
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
  const record = (id, from) => {
    if (!id) return;
    if (!asResult.has(id)) asResult.set(id, []);
    asResult.get(id).push(from);
  };
  for (const row of BASE_BREWING_RECIPES) {
    if (!row?.result) continue;
    record(row.result, `${row.bottle} + ${row.ingredient}`);
    if (row.ingredient) {
      if (!asIngredient.has(row.ingredient)) asIngredient.set(row.ingredient, []);
      asIngredient.get(row.ingredient).push(row.result);
    }
  }
  // The splash and lingering forms are not rows in the table: gunpowder turns any potion into its
  // splash form and dragon's breath turns a splash into a lingering one. Without this they were
  // reported as having no source at all, which is wrong -- they are the most common way a potion is
  // used. `getBrewingResult` is asked rather than the rule restated, so the two cannot drift.
  const derive = (ingredient) => {
    for (const id of [...asResult.keys()]) {
      const produced = getBrewingResult(id, ingredient);
      if (produced && !asResult.has(produced)) record(produced, `${id} + ${ingredient}`);
    }
  };
  derive('gunpowder');       // core -> splash
  derive('dragon_breath');   // splash -> lingering
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
  // Interaction sources are supplied rather than imported, like `smelting`: the modules that produce them
  // pull in Three. `interactionSources.js` itself is data and could be imported, but taking it from the
  // caller keeps every source kind on one path.
  const interactions = sources.interactions ?? [];

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
      // A smithing table transformation: netherite gear comes from nowhere else in vanilla, so without
      // this every piece of it reads as having no source at all.
      smithingFrom: [],
      // Interaction sources: filling a bucket, milking a cow. See `interactionSources.js`.
      codeFrom: [],
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
  // The music discs come from a rule rather than from a loot table: a creeper killed by a skeleton's or a
  // stray's arrow drops one of twelve at random. `mobLootData.js` cannot express that, so without this the
  // twelve would read as items with no source at all when in fact they have exactly one.
  for (const disc of CREEPER_DISC_POOL) {
    for (const key of keysForId(disc)) entries.get(key)?.lootFrom.push('creeper killed by a skeleton');
  }
  // Netherite gear, which comes from a smithing table and from nowhere else. `recipes.json` has no entry
  // for it -- a smithing transformation is not a crafting recipe -- so this is the only way the Inspector
  // can know the gear is obtainable.
  for (const interaction of interactions) {
    for (const key of keysForId(interaction.item)) entries.get(key)?.codeFrom.push(interaction);
  }
  for (const [from, to] of Object.entries(NETHERITE_UPGRADE)) {
    for (const key of keysForId(to)) {
      entries.get(key)?.smithingFrom.push({ base: from, template: NETHERITE_UPGRADE_TEMPLATE, addition: NETHERITE_INGOT });
    }
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
    // The game's own rule, which is what the break path uses: a block that declares neither `drop` nor
    // `dropItem` gives itself, and `drop: null` deliberately gives nothing. This pass used to consult only
    // the explicit forms and skip everything else, so a vine, a cocoa pod, a sweet berry bush and a glow
    // lichen -- and the item each of them drops -- read as having no source at all while the game handed
    // every one of them over.
    const base = baseBlockDrop(Number(blockId));
    if (!base) continue;
    const keys = keysForId(base.id);
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

  // Probabilistic drops are a source too. An apple comes from an oak leaf at half a percent and a wheat
  // seed from a grass plant at an eighth, and neither the leaf's definition nor its harvest row names
  // them -- without this pass `has-source` reports both as items nothing can obtain, which is exactly
  // what it did before `BONUS_DROPS` existed.
  for (const entry of entries.values()) {
    if (entry.blockId === null || entry.blockId === undefined) continue;
    const table = BONUS_DROPS[bonusKeyFor(entry.blockId)];
    if (!table) continue;
    const label = entry.blockDef?.name ?? entry.name ?? String(entry.blockId);
    for (const [item] of table) {
      // Through `keysForId`, not `entries.get(item)`: a sapling is a block with no item form, so it is keyed
      // `block:959` and a lookup by the name `oak_sapling` finds nothing. That silently dropped the leaf ->
      // sapling attribution for every leaf in the game, which is the same mistake the base-drop pass above
      // had just been fixed for.
      for (const key of keysForId(item)) {
        const target = entries.get(key);
        if (target && !target.droppedBy.some((existing) => existing.toLowerCase() === label.toLowerCase())) {
          target.droppedBy.push(label);
        }
      }
    }
  }
  // The drops that replace a block's own. Gravel gives flint or gravel and never both, so flint is a source
  // here even though no single break yields two rows.
  for (const entry of entries.values()) {
    if (entry.blockId === null || entry.blockId === undefined) continue;
    const rule = REPLACEMENT_DROPS[bonusKeyFor(entry.blockId)];
    if (!rule) continue;
    const label = entry.blockDef?.name ?? entry.name ?? String(entry.blockId);
    for (const key of keysForId(rule.id)) {
      const target = entries.get(key);
      if (target && !target.droppedBy.some((existing) => existing.toLowerCase() === label.toLowerCase())) {
        target.droppedBy.push(label);
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
    smithing: entry.smithingFrom.slice(),
    interaction: entry.codeFrom.slice(),
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
 * Object keys that appear more than once in a registry literal.
 *
 * An object literal with a repeated key is not an error, so the earlier definition is discarded with
 * no warning at all -- and the later one wins. Five `ITEMS` keys were in that state on this branch: a
 * `golden_carrot` with `food: 6` was overridden by a later one without it, so a golden carrot could be
 * held but never eaten, and the icon test could not see it because both definitions named the same
 * asset. Nothing in the codebase could report this, which is why the check lives here.
 *
 * Takes the file text rather than reading it, so this module keeps its no-filesystem property.
 *
 * @param {string} source    the contents of a module
 * @param {string} literal   the exported binding name, e.g. `ITEMS`
 * @returns {Array<{key: string, lines: number[]}>}
 */
export function duplicateDefinitions(source, literal) {
  const marker = `export const ${literal} = {`;
  const start = source.indexOf(marker);
  if (start < 0) return [];
  // Walk the braces so a nested object literal cannot end the scan early.
  let depth = 0;
  let end = -1;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return [];
  const body = source.slice(start, end);
  const lineOf = (index) => source.slice(0, start + index).split('\n').length;
  const lines = new Map();
  // Two leading spaces is this file's indentation for a top-level key, which is what keeps a nested
  // entry such as a `textures: { all: ... }` field from being read as a registry key.
  const re = /^ {2}([A-Za-z_][A-Za-z0-9_]*):/gm;
  let match;
  while ((match = re.exec(body))) {
    const key = match[1];
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push(lineOf(match.index));
  }
  return [...lines]
    .filter(([, found]) => found.length > 1)
    .map(([key, found]) => ({ key, lines: found }));
}

/**
 * Blank out comments and the contents of strings, preserving line numbers and quote positions.
 *
 * A scan that reads either reports prose as code: this file's description of the idiom, the comment in
 * `furnace.js` that explains the fix, and any message that mentions the pattern all name `[BLOCKS.X]`.
 * Characters are replaced rather than lines removed so a reported line number stays usable, and quote
 * characters are kept so a caller can still see that something was a string.
 */
function stripComments(source) {
  const out = [];
  let inBlock = false;
  for (const line of String(source).split('\n')) {
    let text = '';
    let quote = null;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const next = line[i + 1];
      if (inBlock) {
        if (ch === '*' && next === '/') { inBlock = false; i++; }
        continue;
      }
      if (quote) {
        if (ch === '\\') { i++; continue; }
        if (ch === quote) { quote = null; text += ch; continue; }
        // Inside a string: keep the column, drop the content.
        continue;
      }
      if (ch === '/' && next === '*') { inBlock = true; i++; continue; }
      if (ch === '/' && next === '/') break;
      if (ch === "'" || ch === '"' || ch === '`') { quote = ch; text += ch; continue; }
      text += ch;
    }
    out.push(text);
  }
  return out.join('\n');
}

/**
 * `[BLOCKS.X]` used as a computed object key where `BLOCKS.X` is not a registered block.
 *
 * The idiom is everywhere in the block tables, and it fails silently in a way nothing else catches: an
 * undefined constant becomes the string key "undefined", so five unregistered ores and one unregistered
 * sapling produced two phantom rows in the furnace tables rather than six dead ones, and the last ore
 * won the key -- `getSmeltingRecipe('undefined')` returned a copper ingot.
 *
 * Takes the file text rather than reading it, so this module keeps its no-filesystem property.
 *
 * @param {string} source
 * @returns {Array<{constant: string, line: number}>}
 */
export function undefinedBlockConstants(source) {
  const out = [];
  const lines = stripComments(source).split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const match of lines[i].matchAll(/\[BLOCKS\.([A-Z0-9_]+)\]/g)) {
      if (typeof BLOCKS[match[1]] === 'number') continue;
      out.push({ constant: match[1], line: i + 1 });
    }
  }
  return out;
}

/**
 * Every `import` in a set of modules that would fail, checked without running anything.
 *
 * This exists because a rename can leave a tree that looks consistent and cannot load. The
 * building/structure rename moved `structureLibrary.js` to `buildingLibrary.js` and updated `main.js` to
 * the new vocabulary, but left four modules importing the old path and left the library exporting the old
 * names -- so `main.js` died on `Cannot find module './structureLibrary.js'`, and once that was fixed, on
 * `does not provide an export named 'BuildingLibrary'`. Neither is visible to a test that never imports
 * the entry point, and both are invisible to the resource checks, which only read data.
 *
 * Takes `{path: text}` rather than reading files, so this module keeps its no-filesystem property.
 *
 * Deliberately conservative: a name is only reported when the target module is present in `sources`,
 * parses as plain exports, and has no `export *` that could supply it. A false accusation here would be
 * worse than a missed one, because the fix is to edit an import.
 *
 * @param {Record<string, string>} sources path -> file text, paths relative to the same root
 * @returns {Array<{file: string, line: number, kind: string, specifier: string, name?: string}>}
 */
export function unresolvedImports(sources) {
  const norm = (p) => String(p).replace(/\\/g, '/');
  const known = new Map(Object.entries(sources).map(([p, text]) => [norm(p), text]));

  // What a module exports: names it declares, plus names it re-exports by name.
  const exportsOf = (text) => {
    const clean = stripComments(text);
    const named = new Set();
    let hasDefault = /^\s*export\s+default\b/m.test(clean);
    let star = false;
    for (const m of clean.matchAll(/^\s*export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z0-9_$]+)/gm)) {
      named.add(m[1]);
    }
    for (const m of clean.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) {
      for (const part of m[1].split(',')) {
        const piece = part.trim();
        if (!piece) continue;
        const as = piece.match(/\bas\s+([A-Za-z0-9_$]+)$/);
        if (as) named.add(as[1]);
        else if (/^[A-Za-z0-9_$]+$/.test(piece)) named.add(piece);
      }
      if (/\bdefault\b/.test(m[1])) hasDefault = true;
    }
    if (/^\s*export\s*\*\s*from\b/m.test(clean)) star = true;
    return { named, hasDefault, star };
  };

  const resolve = (fromFile, spec) => {
    if (!spec.startsWith('.')) return null;
    const base = norm(fromFile).split('/').slice(0, -1);
    const parts = spec.split('/');
    const out = [...base];
    for (const part of parts) {
      if (part === '.' || part === '') continue;
      if (part === '..') out.pop();
      else out.push(part);
    }
    const path = out.join('/');
    if (known.has(path)) return path;
    // Only `.js` modules are indexed, so a bare directory is not followed.
    return null;
  };

  const out = [];
  for (const [file, text] of known) {
    const clean = stripComments(text);
    // `stripComments` blanks string contents as well as comments, which preserves line numbers but
    // destroys the module specifier inside the quotes. So the two are used together: the stripped line
    // decides whether this line really is code, and the raw line supplies the path. Reading only the
    // stripped text made this scan report zero faults on a tree whose entry point did not load.
    const codeLines = clean.split('\n');
    const rawLines = String(text).split('\n');
    for (let i = 0; i < codeLines.length; i++) {
      if (!/\bimport\b/.test(codeLines[i])) continue;
      const line = rawLines[i] ?? '';
      const spec = line.match(/\bfrom\s+'(\.[^']+)'/)?.[1] ?? line.match(/\bimport\s*\(\s*'(\.[^']+)'/)?.[1];
      if (!spec) continue;
      const target = resolve(file, spec);
      if (!target) {
        // A relative specifier that no indexed module answers to is a broken path, unless it is a
        // directory import this scan cannot follow or an asset the bundler handles.
        if (!/\.(js|mjs)$/.test(spec)) continue;
        out.push({ file, line: i + 1, kind: 'unresolved-path', specifier: spec });
        continue;
      }
      const targetExports = exportsOf(known.get(target));
      const clause = line.match(/\bimport\s*\{([^}]*)\}\s*from/);
      if (clause) {
        for (const part of clause[1].split(',')) {
          const piece = part.trim();
          if (!piece) continue;
          const local = piece.match(/^([A-Za-z0-9_$]+)(?:\s+as\s+[A-Za-z0-9_$]+)?$/);
          if (!local) continue;
          if (targetExports.named.has(local[1]) || targetExports.star) continue;
          out.push({ file, line: i + 1, kind: 'missing-export', specifier: spec, name: local[1] });
        }
        continue;
      }
      if (/\bimport\s+[A-Za-z0-9_$]+\s+from/.test(line) && !targetExports.hasDefault && !targetExports.star) {
        out.push({ file, line: i + 1, kind: 'missing-default-export', specifier: spec });
      }
    }
  }
  return out;
}

/**
 * Harvest rows that no block answers to, split by whether the block exists.
 *
 * `BLOCK_HARVEST` is generated for every vanilla block, so it runs ahead of the registry by design --
 * 173 of its 1056 rows name a block this game does not have yet. Those are a to-do list for block work,
 * not a defect, and `missingBlock` is that list, with the drop it is holding ready.
 *
 * `deadByKey` is the defect. It is a row whose block *is* registered and which could not be reached
 * anyway, because the table was keyed only on `BLOCKS[name.toUpperCase()]` and the game registers blocks
 * through two routes. Three rows were in that state: `snow_block`, `potatoes` and
 * `wither_skeleton_skull`. The last had no `drop` in its definition, so its harvest row was the only
 * thing that would have made breaking one yield anything.
 *
 * @param {object} [reg]
 * @returns {{missingBlock: Array<{name: string, drops: string[]}>, deadByKey: Array<{name: string, blockId: number}>}}
 */
export function harvestOrphans(reg = registry()) {
  const missingBlock = [];
  const deadByKey = [];
  for (const name of knownHarvestNames()) {
    const entry = resolveResource(name, reg);
    if (!entry || entry.blockId === null || entry.blockId === undefined) {
      missingBlock.push({ name, drops: (BLOCK_HARVEST[name]?.drops ?? []).map(String) });
      continue;
    }
    if (!harvestDataFor(entry.blockId)) deadByKey.push({ name, blockId: entry.blockId });
  }
  return { missingBlock, deadByKey };
}

/**
 * Spellings this game has used for a vanilla id under a different name.
 *
 * Two of these are plain vocabulary differences rather than near-misses, so a singular/plural rule cannot
 * find them: vanilla's `slime_ball` was `slimeball` here, and vanilla's `hay_block` was also `hay_bale`.
 * Both are gone now, and the entries stay deliberately -- if either spelling is reintroduced, `shadows`
 * names it again rather than reporting nothing because the alias table was cleaned up alongside the fix.
 */
export const VANILLA_ID_ALIASES = {
  slimeball: 'slime_ball',
  hay_bale: 'hay_block',
};

/**
 * Ids this game defines that shadow a vanilla id under a different spelling.
 *
 * The complement of `missingVanillaItems`, which asks what vanilla has and this game lacks. This asks the
 * opposite question -- what this game has under a name vanilla does not use -- and the answer mattered:
 * eight ids were duplicates of a vanilla item, six of them with *both* halves registered. Two slimeball
 * ids meant a frog could not eat the slimeball a slime dropped, and two hay ids meant the horse food table
 * was keyed on a name no block answered to. All eight are removed; this report is what found them and what
 * will find the next one.
 *
 * A report rather than a fault: a differently-spelled id is legitimate when it is this project's own
 * content, and the two databases only disagree about the name. `bothRegistered` is what separates a
 * duplicate from a rename, and only a duplicate is a defect.
 *
 * @param {object} reg
 * @param {Set<string>} vanillaNames vanilla item and block names
 * @returns {Array<{id: string, vanilla: string, bothRegistered: boolean}>}
 */
export function shadowedVanillaIds(reg, vanillaNames, { aliases = VANILLA_ID_ALIASES } = {}) {
  const known = (id) => typeof id === 'string' && vanillaNames.has(id);
  const out = [];
  for (const entry of reg.entries.values()) {
    if (entry.internal) continue;
    const id = String(entry.id);
    if (known(id)) continue;
    const candidates = [];
    if (aliases[id]) candidates.push(aliases[id]);
    // One plural step in either direction, which is how `wheat_seed` shadows `wheat_seeds`.
    candidates.push(id.endsWith('s') ? id.slice(0, -1) : `${id}s`);
    const vanilla = candidates.find(known);
    if (!vanilla) continue;
    out.push({ id, vanilla, bothRegistered: resolveResource(vanilla, reg) !== null });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
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
