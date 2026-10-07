// Turning the generators' JSON into the shapes this game actually consumes.
//
// The loader in `dataPack.js` decides WHAT a file is. This module decides what it MEANS: a vanilla
// `crafting_shaped` recipe is not a `{ pattern, result }` the matcher can use, and a vanilla biome is not a
// `BIOMES` entry. Each adapter is a small, total function -- it returns null rather than throwing, because a
// pack is user input and half of one is normal.
//
// The hard part in every adapter is the same: vanilla names are `minecraft:oak_planks` strings, while this
// game keys blocks by an upper-snake registry name with a numeric id and items by a lower-snake string.
import { BLOCKS, ITEMS, BLOCK_DEFS } from './blocks.js';
import { buildGameBlockIndex, resolveVanillaBlock, normaliseBlockName } from './blockNameMatch.js';

/** The index is expensive to build, so it is built once per process. */
let blockIndexCache = null;
function blockIndex() {
  if (!blockIndexCache) blockIndexCache = buildGameBlockIndex();
  return blockIndexCache;
}

/** For tests that mutate the registry. */
export function resetAdapterCaches() {
  blockIndexCache = null;
}

/**
 * A vanilla id to something the game can hold.
 *
 * Order matters and follows how the hand-written recipes are written: a name that is a block becomes the
 * BLOCK id, because `BLOCKS.OAK_PLANKS` is what the crafting matcher stores. Only a name with no block falls
 * through to an item string.
 *
 * @param {string} vanillaId e.g. `minecraft:oak_planks`
 * @returns {{id:number|string, isBlock:boolean, name:string}|null} null when the game has no such thing
 */
export function resolveGameId(vanillaId) {
  if (typeof vanillaId !== 'string' || !vanillaId) return null;
  let name = vanillaId.trim().toLowerCase();
  const colon = name.indexOf(':');
  if (colon >= 0) name = name.slice(colon + 1);
  if (!name) return null;

  // 1. An item that declares itself a block carries the block id, which is the most explicit answer.
  const item = ITEMS[name];
  if (item && item.isBlock === true && typeof item.blockId === 'number') {
    return { id: item.blockId, isBlock: true, name };
  }
  // 2. A block whose registry key is the upper-snake of the vanilla name.
  const upper = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (typeof BLOCKS[upper] === 'number') return { id: BLOCKS[upper], isBlock: true, name };
  // 3. A plain item.
  if (item) return { id: name, isBlock: false, name };
  // 4. A name the game implements under a different key -- the alias table, which is how `grass_block`
  //    finds `GRASS` and how a wiki name finds a registry key that spells it differently.
  const aliased = resolveVanillaBlock(name, blockIndex());
  if (aliased.length > 0 && typeof BLOCKS[aliased[0]] === 'number') {
    return { id: BLOCKS[aliased[0]], isBlock: true, name };
  }
  return null;
}

/** Everything an ingredient slot can be: `{item}`, `{id}`, `{tag}`, a bare id, or a bare `#tag`. */
function ingredientToId(ingredient) {
  if (typeof ingredient === 'string') {
    // A `#` prefix is a TAG REFERENCE and it is written as a plain string in vanilla JSON, e.g.
    // `"ingredients": ["#minecraft:oak_logs"]`. The first version of this only looked for a `tag` property,
    // so every vanilla recipe that used a tag -- which is most of them -- fell through to null and the
    // recipe vanished silently.
    if (ingredient.startsWith('#')) return { tag: ingredient.slice(1) };
    return resolveGameId(ingredient);
  }
  if (!ingredient || typeof ingredient !== 'object') return null;
  if (typeof ingredient.item === 'string') return resolveGameId(ingredient.item);
  if (typeof ingredient.id === 'string') return resolveGameId(ingredient.id);
  if (typeof ingredient.tag === 'string') {
    return { tag: ingredient.tag.startsWith('#') ? ingredient.tag.slice(1) : ingredient.tag };
  }
  return null;
}

/**
 * A result object: `{ item, count }` in 1.21, `{ id, count }` in older output.
 */
function resultToGameId(result) {
  if (!result) return null;
  const raw = typeof result.item === 'string' ? result.item
    : (typeof result.id === 'string' ? result.id : null);
  if (!raw) return null;
  const resolved = resolveGameId(raw);
  if (!resolved) return null;
  return { id: resolved.id, isBlock: resolved.isBlock, count: Number.isFinite(result.count) ? result.count : 1 };
}

/**
 * Every concrete game id an ingredient can be.
 *
 * A tag becomes one variant per member. The game's crafting matcher takes a single id per cell, so a tag
 * cannot be one cell -- but vanilla means "any of these works", and one recipe variant per member is exactly
 * that. The first version returned a single `unresolvedTag` marker, which loaded nothing at all.
 *
 * @returns {{ids:Array, tags:string[], unresolved:string[]}}
 */
function expandIngredient(ingredient, expandTag) {
  const resolved = ingredientToId(ingredient);
  if (!resolved) return { ids: [], tags: [], unresolved: [describeIngredient(ingredient)] };
  if (!resolved.tag) return { ids: [resolved.id], tags: [], unresolved: [] };

  const members = typeof expandTag === 'function' ? expandTag(resolved.tag) : null;
  if (!Array.isArray(members) || members.length === 0) {
    // The tag is not in the pack, or is empty. Recorded rather than guessed at.
    return { ids: [], tags: [resolved.tag], unresolved: [`#${resolved.tag}`] };
  }
  const ids = [];
  for (const member of members) {
    const one = resolveGameId(member);
    if (one) ids.push(one.id);
  }
  return { ids, tags: [resolved.tag], unresolved: ids.length ? [] : [`#${resolved.tag}`] };
}

/** A readable form of an ingredient, for a skip report. */
function describeIngredient(ingredient) {
  if (typeof ingredient === 'string') return ingredient;
  if (ingredient && typeof ingredient === 'object') {
    return ingredient.item ?? ingredient.id ?? (ingredient.tag ? `#${ingredient.tag}` : JSON.stringify(ingredient));
  }
  return String(ingredient);
}

/**
 * A crafting recipe, possibly as several variants.
 *
 * Returns a **2x2 or 3x3** grid choice, because the game keeps two separate lists and a 2x2 pattern in the
 * 3x3 list is unreachable from the inventory grid.
 *
 * A tag ingredient multiplies the variants, and the product is capped: a shaped recipe with three tag cells
 * of a common tag would otherwise generate thousands of near-identical entries. The cap is reported.
 *
 * @param {object} json
 * @param {{expandTag?:(tag:string)=>string[]}} [options]
 * @returns {{grid:string, recipes:object[], tags:string[], unresolved:string[], capped?:boolean}|null}
 */
export function adaptCraftingRecipe(json, options = {}) {
  if (!json || typeof json !== 'object') return null;
  const result = resultToGameId(json.result);
  if (!result) return null;
  const expandTag = options.expandTag;
  const tags = [];
  const unresolved = [];

  if (Array.isArray(json.ingredients)) {
    // Shapeless. Each ingredient is an independent choice, so the variants are the cross product.
    const choices = [];
    for (const raw of json.ingredients) {
      const expanded = expandIngredient(raw, expandTag);
      tags.push(...expanded.tags);
      unresolved.push(...expanded.unresolved);
      choices.push(expanded.ids);
    }
    const recipes = crossProduct(choices, options.variantLimit ?? MAX_VARIANTS)
      .map(ingredients => ({ shapeless: true, ingredients, result }));
    // Shapeless recipes are matched by multiset, and the game keeps them in the 3x3 list.
    return {
      grid: '3x3',
      recipes,
      tags,
      unresolved,
      // Reported here too, not only on the shaped path: a shapeless recipe with one broad tag is exactly as
      // capable of flooding the list, and omitting it made the cap silent on that side.
      capped: choices.some(list => list.length > 1) && recipes.length >= (options.variantLimit ?? MAX_VARIANTS),
    };
  }

  if (Array.isArray(json.pattern)) {
    const rows = json.pattern;
    if (rows.length === 0) return null;
    const width = Math.max(...rows.map(r => (typeof r === 'string' ? r.length : 0)));
    if (width === 0) return null;
    const key = json.key && typeof json.key === 'object' ? json.key : {};

    // One choice list per CELL, so the cross product varies one symbol at a time.
    const cellChoices = [];
    const cells = [];
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < width; c++) {
        const symbol = rows[r][c] ?? ' ';
        // A space is an empty cell and it has to stay null: an empty slot the matcher can place is a
        // different recipe from one with a hole in it.
        if (symbol === ' ') { cells.push({ fixed: null }); continue; }
        const expanded = expandIngredient(key[symbol], expandTag);
        tags.push(...expanded.tags);
        unresolved.push(...expanded.unresolved);
        cells.push({ choices: expanded.ids });
      }
    }
    // A cell that resolved to nothing makes the whole recipe unusable.
    if (cells.some(cell => cell.choices && cell.choices.length === 0)) {
      return { grid: (rows.length <= 2 && width <= 2) ? '2x2' : '3x3', recipes: [], tags, unresolved };
    }
    for (const cell of cells) if (cell.choices) cellChoices.push(cell.choices);
    const combinations = crossProduct(cellChoices, options.variantLimit ?? MAX_VARIANTS);
    const recipes = combinations.map(picked => {
      let i = 0;
      const pattern = [];
      for (let r = 0; r < rows.length; r++) {
        const row = [];
        for (let c = 0; c < width; c++) {
          const cell = cells[r * width + c];
          row.push(cell.choices ? picked[i++] : null);
        }
        pattern.push(row);
      }
      return { pattern, result };
    });
    const grid = (rows.length <= 2 && width <= 2) ? '2x2' : '3x3';
    const capped = combinations.length >= (options.variantLimit ?? MAX_VARIANTS);
    return { grid, recipes, tags, unresolved, capped };
  }

  return null;
}

/** How many variants one recipe may expand into, so a broad tag cannot flood the recipe list. */
export const MAX_VARIANTS = 64;

/**
 * The cross product of several choice lists, capped.
 *
 * Built incrementally so the cap stops the work rather than trimming a list that was already built -- a
 * three-cell tag of forty members is 64,000 combinations if it is built first and cut afterwards.
 */
function crossProduct(choices, limit = MAX_VARIANTS) {
  let out = [[]];
  for (const options of choices) {
    const next = [];
    for (const prefix of out) {
      for (const option of options) {
        next.push([...prefix, option]);
        if (next.length >= limit) break;
      }
      if (next.length >= limit) break;
    }
    out = next;
    if (out.length === 0) break;
  }
  return out;
}

/**
 * A cooking recipe.
 *
 * The game's `SMELTING_RECIPES` is keyed by input and carries only the output, so the xp and the cook time
 * are returned alongside for a caller that wants them rather than being dropped silently.
 */
export function adaptCookingRecipe(json) {
  if (!json || typeof json !== 'object') return null;
  const ingredients = Array.isArray(json.ingredient) ? json.ingredient : [json.ingredient];
  const input = ingredientToId(ingredients[0]);
  if (!input || input.tag) return null;
  const result = resultToGameId(json.result);
  if (!result) return null;
  return {
    input: input.id,
    result: { id: result.id, isBlock: result.isBlock, count: result.count },
    xp: Number.isFinite(json.experience) ? json.experience : 0,
    seconds: Number.isFinite(json.cookingtime) ? json.cookingtime / 20 : null,
  };
}

/** Dispatch a `recipe/*.json` by its declared type. */
export function adaptRecipe(json, options = {}) {
  const type = typeof json?.type === 'string' ? json.type.replace(/^minecraft:/, '') : '';
  if (type === 'crafting_shaped' || type === 'crafting_shapeless') return adaptCraftingRecipe(json, options);
  if (type === 'smelting' || type === 'blasting' || type === 'smoking' || type === 'campfire_cooking') {
    return adaptCookingRecipe(json);
  }
  if (type === 'stonecutting' || type === 'smithing_transform' || type === 'smithing_trim') {
    // Real vanilla types this game has no station for. Named rather than silently treated as unknown.
    return { unsupported: type };
  }
  return null;
}

/**
 * The `set_count` and `set_count`-like functions on a loot entry.
 *
 * Vanilla expresses a count as a function OR as a plain number, and a uniform range as
 * `{min, max}`. All three appear in real tables.
 */
function countRangeFrom(entry) {
  const functions = Array.isArray(entry?.functions) ? entry.functions : [];
  for (const fn of functions) {
    if (typeof fn?.function !== 'string') continue;
    if (!/set_count$/.test(fn.function)) continue;
    if (Number.isFinite(fn.count)) return { min: fn.count, max: fn.count };
    if (fn.count && Number.isFinite(fn.count.min) && Number.isFinite(fn.count.max)) {
      return { min: fn.count.min, max: fn.count.max };
    }
  }
  return { min: 1, max: 1 };
}

/** The chance a pool's `random_chance` condition gives an entry, and the roll count of its pool. */
function poolRolls(pool) {
  if (Number.isFinite(pool?.rolls)) return Math.max(0, Math.floor(pool.rolls));
  if (pool?.rolls && Number.isFinite(pool.rolls.min)) return Math.max(0, Math.floor(pool.rolls.min));
  return 1;
}

/**
 * A loot table.
 *
 * Returns the **guaranteed** drops, the **pooled** ones and the ones gated behind a chance condition,
 * separately. The game's own drop model has exactly those three ideas -- `baseBlockDrop`, the pool tables and
 * `BONUS_DROPS` -- so flattening them together here would lose the distinction the wiring needs.
 *
 * `minecraft:alternatives` is honoured by taking its first entry, which is what it means: the first branch
 * whose conditions pass, and the first is unconditional in every vanilla table that uses it.
 */
export function adaptLootTable(json) {
  if (!json || !Array.isArray(json.pools)) return null;
  const guaranteed = [];
  const pooled = [];
  const conditional = [];
  const unresolved = [];

  for (const pool of json.pools) {
    const rolls = poolRolls(pool);
    if (rolls <= 0) continue;
    const entries = Array.isArray(pool.entries) ? pool.entries : [];
    if (entries.length === 0) continue;

    // A pool with one entry and one roll is the "this always drops" case.
    const always = rolls >= 1 && entries.length === 1;
    const chance = chanceFromConditions(pool.conditions);

    for (const entry of entries) {
      const picked = firstItemEntry(entry);
      if (!picked) continue;
      const resolved = resolveGameId(picked.name);
      if (!resolved) { unresolved.push(picked.name); continue; }
      const range = countRangeFrom(picked);
      const record = { id: resolved.id, isBlock: resolved.isBlock, min: range.min, max: range.max };
      // A branch that was only reachable under a condition is not a guarantee, however few branches it had.
      if (picked.conditional) { conditional.push(record); continue; }
      if (chance !== null && chance < 1) conditional.push({ ...record, chance });
      else if (always && entries.length === 1 && rolls === 1) guaranteed.push(record);
      else pooled.push({ ...record, rolls });
    }
  }

  return { guaranteed, pooled, conditional, unresolved };
}

/**
 * An `alternatives` entry nests its branches.
 *
 * The first UNCONDITIONAL branch wins, not simply the first branch. Diamond ore is the case that matters:
 * its first alternative is `diamond_ore` **gated on silk touch** and its second is `diamond`, so taking the
 * first child unconditionally reports that diamond ore drops diamond ore -- which is only true with a
 * silk-touch pickaxe. With all branches conditional, the first is taken and it is recorded as conditional.
 */
function firstItemEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const type = typeof entry.type === 'string' ? entry.type.replace(/^minecraft:/, '') : '';
  if (type === 'alternatives' && Array.isArray(entry.children) && entry.children.length > 0) {
    const unconditional = entry.children.find(child => !Array.isArray(child?.conditions) || child.conditions.length === 0);
    const picked = unconditional ?? entry.children[0];
    const resolved = firstItemEntry(picked);
    if (resolved && !unconditional) return { ...resolved, conditional: true };
    return resolved;
  }
  if (type === 'item' && typeof entry.name === 'string') return entry;
  // `loot_table`, `tag`, `group`, `sequence` and `dynamic` are real and are not one item.
  return null;
}

/** A `random_chance` condition, as a probability, or null when there is none. */
function chanceFromConditions(conditions) {
  if (!Array.isArray(conditions)) return null;
  for (const condition of conditions) {
    if (typeof condition?.condition !== 'string') continue;
    if (/random_chance_with_looting$/.test(condition.condition)) {
      // Looting moves this, and the game applies its own looting bonus, so the base chance is the honest
      // figure to hand over.
      return Number.isFinite(condition.chance) ? condition.chance : null;
    }
    if (/random_chance$/.test(condition.condition)) {
      return Number.isFinite(condition.chance) ? condition.chance : null;
    }
  }
  return null;
}

/**
 * A tag.
 *
 * Entries starting with `#` are tag references and are preserved as such: the game has no tag resolver, and
 * flattening a reference into its members here would silently freeze a tag that vanilla keeps dynamic.
 */
export function adaptTag(json) {
  if (!json || !Array.isArray(json.values)) return null;
  const values = [];
  const required = [];
  for (const raw of json.values) {
    if (typeof raw === 'string') { values.push(raw); continue; }
    if (raw && typeof raw === 'object' && typeof raw.id === 'string') {
      if (raw.required === false) values.push(raw.id);
      else required.push(raw.id);
      continue;
    }
  }
  return {
    values,
    required,
    references: values.filter(v => v.startsWith('#')),
    replace: json.replace === true,
  };
}

/**
 * A biome.
 *
 * Vanilla's `worldgen/biome` carries the **climate**, the **effects** and the **spawners**, but it does NOT
 * carry the terrain: surface blocks, base height and height scale come from `noise_settings` and the surface
 * rules, and trees come from the placed-feature list. This game's biome model is a flat record with those
 * fields on it.
 *
 * So the terrain fields are taken from `fallback` -- the game's own nearest biome -- and the mapped fields win
 * over it. That is a documented approximation: the file genuinely does not say what this game needs to hear.
 *
 * @param {object} json
 * @param {object|null} fallback an existing `BIOMES` entry to inherit the terrain fields from
 */
export function adaptBiome(json, fallback = null) {
  if (!json || typeof json !== 'object') return null;
  const effects = json.effects && typeof json.effects === 'object' ? json.effects : {};
  const base = fallback && typeof fallback === 'object' ? { ...fallback } : {};

  // Colours come through as decimal ints, which is the form `THREE.Color` takes directly.
  const colour = (value) => (Number.isFinite(value) ? value : undefined);
  return {
    ...base,
    skyColor: colour(effects.sky_color) ?? base.skyColor,
    fogColor: colour(effects.fog_color) ?? base.fogColor,
    waterColor: colour(effects.water_color) ?? base.waterColor,
    waterFogColor: colour(effects.water_fog_color) ?? base.waterFogColor,
    grassColor: colour(effects.grass_color) ?? base.grassColor,
    foliageColor: colour(effects.foliage_color) ?? base.foliageColor,
    temperature: Number.isFinite(json.temperature) ? json.temperature : base.temperature,
    downfall: Number.isFinite(json.downfall) ? json.downfall : base.downfall,
    hasPrecipitation: json.has_precipitation !== false,
    // Spawners become the mob list. Vanilla weights them; this game's list is unweighted, so a mob that
    // appears in any category appears once.
    mobs: spawnerMobList(json.spawners) ?? base.mobs,
    // `dimension` is not in the file -- a biome is not bound to one -- so it is inherited and corrected by
    // the caller that knows which dimension it is loading for.
    fromDataPack: true,
  };
}

/** Every mob named by any spawner category, de-duplicated and sorted for a stable result. */
export function spawnerMobList(spawners) {
  if (!spawners || typeof spawners !== 'object') return null;
  const seen = new Set();
  for (const list of Object.values(spawners)) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (typeof entry?.type !== 'string') continue;
      seen.add(entry.type.replace(/^minecraft:/, ''));
    }
  }
  return [...seen].sort();
}

/**
 * A dimension type.
 *
 * This one maps almost one-to-one, because the game's dimension model was written from the same fields:
 * whether it has a sky, whether it is hot, what its ambient light is, and whether a bed or a respawn anchor
 * works there.
 */
export function adaptDimensionType(json) {
  if (!json || typeof json !== 'object') return null;
  const effects = typeof json.effects === 'string' ? json.effects.replace(/^minecraft:/, '') : null;
  return {
    ultrawarm: json.ultrawarm === true,
    natural: json.natural !== false,
    hasSkylight: json.has_skylight !== false,
    hasCeiling: json.has_ceiling === true,
    ambientLight: Number.isFinite(json.ambient_light) ? json.ambient_light : 0,
    fixedTime: Number.isFinite(json.fixed_time) ? json.fixed_time : null,
    coordinateScale: Number.isFinite(json.coordinate_scale) ? json.coordinate_scale : 1,
    minY: Number.isFinite(json.min_y) ? json.min_y : 0,
    height: Number.isFinite(json.height) ? json.height : 384,
    logicalHeight: Number.isFinite(json.logical_height) ? json.logical_height : 384,
    bedWorks: json.bed_works !== false,
    respawnAnchorWorks: json.respawn_anchor_works === true,
    piglinSafe: json.piglin_safe === true,
    hasRaids: json.has_raids !== false,
    // `effects` names the sky/fog preset: `overworld`, `the_nether` or `the_end`.
    effects,
    // The game's own short names, derived rather than declared.
    isNether: effects === 'the_nether' || json.ultrawarm === true,
    isEnd: effects === 'the_end' || json.has_ceiling === true && json.has_skylight === false,
  };
}

/**
 * Build a tag expander over resolved packs.
 *
 * Tags are why the loader needs a resolution PASS rather than one adapter per file: vanilla's own
 * `oak_planks` recipe names `#minecraft:oak_logs`, so the recipe cannot be adapted until the tags are known.
 * A tag may also reference other tags, which is why this walks.
 *
 * @param {{byType:object}} resolved from `mergePacks`
 * @param {'item_tag'|'block_tag'} [kind]
 * @returns {(tag:string, depth?:number)=>string[]} concrete ids, or [] when the tag is absent
 */
export function createTagExpander(resolved, kind = 'item_tag') {
  const tags = resolved?.byType?.[kind] ?? new Map();
  const cache = new Map();

  const expand = (tag, depth = 0) => {
    const id = normaliseTagId(tag);
    if (!id) return [];
    if (cache.has(id)) return cache.get(id);
    // A cycle is possible in a malformed pack, and a tag graph is user input.
    if (depth > 8) return [];
    const entry = tags.get(id);
    if (!entry) return [];
    // An entry may be a raw `{json}` from a resolved pack, or an ALREADY ADAPTED tag from the live
    // `TAG_REGISTRY`. Reading `entry.json` unconditionally meant the runtime's own registry produced nothing
    // -- `adaptTag(undefined)` is null -- so every tag-based recipe came out with zero variants even though
    // the tag had loaded.
    const adapted = Array.isArray(entry.values) ? entry : adaptTag(entry.json);
    if (!adapted) return [];
    const out = [];
    for (const value of [...adapted.values, ...(adapted.required ?? [])]) {
      if (typeof value !== 'string') continue;
      if (value.startsWith('#')) {
        // A nested tag reference. Vanilla forbids a direct cycle but a pack can still contain one.
        for (const member of expand(value.slice(1), depth + 1)) out.push(member);
        continue;
      }
      out.push(value);
    }
    const unique = [...new Set(out)];
    cache.set(id, unique);
    return unique;
  };

  return expand;
}

/** `#minecraft:logs` and `minecraft:logs` are the same tag. */
function normaliseTagId(tag) {
  if (typeof tag !== 'string') return null;
  let value = tag.trim();
  if (value.startsWith('#')) value = value.slice(1);
  if (!value) return null;
  if (!value.includes(':')) value = `minecraft:${value}`;
  return value.toLowerCase();
}

/**
 * A structure's placement, kept as the file wrote it for the engine to interpret.
 */
export function adaptStructure(json) {
  if (!json || typeof json !== 'object') return null;
  const type = typeof json.type === 'string' ? json.type.replace(/^minecraft:/, '') : '';
  if (!type) return null;
  return {
    type,
    biomes: json.biomes ?? null,
    step: json.step ?? null,
    terrainAdaptation: json.terrain_adaptation ?? null,
    spawnOverrides: json.spawn_overrides ?? null,
    startPool: json.start_pool ?? null,
    // Everything the engine cannot yet act on is preserved rather than discarded, so a later round can
    // consume it without the file having to be re-loaded.
    raw: json,
    fromDataPack: true,
  };
}

/**
 * A placed feature.
 *
 * `placement` is a list of modifiers and `feature` names a configured feature, which is one more indirection
 * than this game's generator has. Both are preserved so a caller can walk the chain.
 */
export function adaptPlacedFeature(json) {
  if (!json || typeof json !== 'object') return null;
  if (!json.feature) return null;
  return {
    feature: json.feature,
    placement: Array.isArray(json.placement) ? json.placement : [],
    raw: json,
    fromDataPack: true,
  };
}
