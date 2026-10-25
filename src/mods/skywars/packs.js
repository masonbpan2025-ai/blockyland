// SkyWars data packs: what a map template's arena is made of, what grows on it, and what extra loot its chests hold.
//
// A pack is laid out as a Minecraft data pack, the flat path -> JSON map the game's own loader reads (dataPack.js):
//
//     pack.mcmeta                                   { "pack": { "pack_format": 61, "description": ... } }
//     data/skywars/skywars/arena.json               the generation settings (below), this mod's own type
//     data/skywars/loot_table/chests/island.json    vanilla loot tables, rolled once per spawn island,
//     data/skywars/loot_table/chests/mid.json         per connector or sector chest,
//     data/skywars/loot_table/chests/center.json      and per middle chest, on top of the Normal/Insane loot
//
// Blocks and items are vanilla ids ("minecraft:packed_ice"), resolved to the game's own (dataPackAdapters.js
// resolveGameId). The loot tables use vanilla's format: pools with `rolls` (a number or {min, max}), weighted
// `minecraft:item` and `minecraft:empty` entries, `minecraft:set_count`, `minecraft:set_enchantments`, and the
// `minecraft:random_chance` condition.
import { resolveGameId } from '../../dataPackAdapters.js';
import { enchantmentEntry } from '../../enchanting.js';
import { BLOCKS } from '../../blocks.js';
import { TEMPLATE_IDS } from './templates.js';
import meadow from './packs/meadow.js';
import frozenPeaks from './packs/frozenPeaks.js';
import netherRift from './packs/netherRift.js';
import tropicalAtoll from './packs/tropicalAtoll.js';
import mushroomIsles from './packs/mushroomIsles.js';
import skyRuins from './packs/skyRuins.js';
import stoneKeep from './packs/stoneKeep.js';
import desertFortress from './packs/desertFortress.js';
import endCitadel from './packs/endCitadel.js';
import sweetSlices from './packs/sweetSlices.js';
import volcanicShards from './packs/volcanicShards.js';
import cherryGrove from './packs/cherryGrove.js';

export const ARENA_PATH = 'data/skywars/skywars/arena.json';
export const LOOT_PATHS = Object.freeze({
  island: 'data/skywars/loot_table/chests/island.json',
  mid: 'data/skywars/loot_table/chests/mid.json',
  center: 'data/skywars/loot_table/chests/center.json',
});
export const DECORATION_TYPES = Object.freeze(['tree', 'huge_mushroom', 'huge_fungus', 'plants', 'spike', 'boulder', 'pool', 'ruin',
  'lamp_post', 'striped_pillar', 'hanging']);
export const CENTER_FEATURES = Object.freeze(['lamp_posts', 'tree', 'huge_mushroom', 'huge_fungus', 'beacon_tower', 'none']);
const ROLES = ['spawn', 'center', 'mid', 'sector'];

/**
 * Read a pack. Returns the pack with every block resolved to the game's id, or `errors` saying what is wrong with it.
 * @param {Record<string, any>} files path -> parsed JSON
 */
export function loadPack(files) {
  const errors = [];
  const arena = files?.[ARENA_PATH];
  if (!arena || typeof arena !== 'object') return { errors: [`missing ${ARENA_PATH}`] };
  const format = files['pack.mcmeta']?.pack?.pack_format;
  if (!Number.isInteger(format)) errors.push('pack.mcmeta has no pack_format');
  const block = (name, where) => {
    const resolved = resolveGameId(name);
    if (!resolved?.isBlock) { errors.push(`${where}: ${JSON.stringify(name)} is not a block`); return BLOCKS.STONE; }
    return resolved.id;
  };
  const p = arena.palette ?? {};
  const palette = {
    surface: block(p.surface, 'palette.surface'),
    subsurface: block(p.subsurface, 'palette.subsurface'),
    core: block(p.core, 'palette.core'),
    ores: (p.ores ?? []).map((o, i) => ({ block: block(o.block, `palette.ores[${i}]`), chance: Math.max(0, Math.min(0.5, Number(o.chance) || 0)) })),
    cage: block(p.cage ?? 'minecraft:glass', 'palette.cage'),
    accent: block(p.accent ?? p.core, 'palette.accent'),
    trim: block(p.trim ?? p.accent ?? p.core, 'palette.trim'),
    light: block(p.light ?? 'minecraft:glowstone', 'palette.light'),
  };
  const decorations = (arena.decorations ?? []).map((d, i) => {
    const where = `decorations[${i}]`;
    if (!DECORATION_TYPES.includes(d?.type)) { errors.push(`${where}: unknown type ${JSON.stringify(d?.type)}`); return null; }
    const out = { ...d, on: Array.isArray(d.on) ? d.on.filter((r) => ROLES.includes(r)) : ROLES };
    for (const key of ['block', 'cap', 'fluid', 'post', 'light']) if (d[key] !== undefined) out[key] = block(d[key], `${where}.${key}`);
    if (d.blocks !== undefined) out.blocks = (Array.isArray(d.blocks) ? d.blocks : []).map((b, j) => block(b, `${where}.blocks[${j}]`));
    if (['plants', 'ruin', 'striped_pillar'].includes(d.type) && !out.blocks?.length) errors.push(`${where}: needs blocks`);
    if (['spike', 'boulder', 'hanging'].includes(d.type) && out.block === undefined) errors.push(`${where}: needs a block`);
    if (d.type === 'pool' && ![BLOCKS.WATER, BLOCKS.LAVA].includes(out.fluid)) errors.push(`${where}: a pool is water or lava`);
    if (d.type === 'plants' || d.type === 'hanging') out.density = Math.max(0, Math.min(1, Number(d.density) || 0));
    return out;
  }).filter(Boolean);
  const c = arena.center ?? {};
  if (c.feature !== undefined && !CENTER_FEATURES.includes(c.feature)) errors.push(`center.feature: unknown ${JSON.stringify(c.feature)}`);
  const center = {
    feature: CENTER_FEATURES.includes(c.feature) ? c.feature : 'lamp_posts',
    kind: typeof c.kind === 'string' ? c.kind : undefined,
    chests: Number.isInteger(c.chests) ? Math.max(2, Math.min(8, c.chests)) : undefined,
    enchanting_tables: Number.isInteger(c.enchanting_tables) ? Math.max(0, Math.min(2, c.enchanting_tables)) : 1,
    anvils: Number.isInteger(c.anvils) ? Math.max(0, Math.min(3, c.anvils)) : 1,
    brewing_stand: Boolean(c.brewing_stand),
  };
  const t = arena.terrain ?? {};
  const terrain = {
    roughness: Math.max(0, Math.min(0.5, Number(t.roughness ?? 0.2))),
    depth: Math.max(0.8, Math.min(3, Number(t.depth ?? 1.6))),
    size: Math.max(0.85, Math.min(1.15, Number(t.size ?? 1))),
  };
  const templates = (arena.templates ?? []).filter((id) => TEMPLATE_IDS.includes(id));
  if (!templates.length) errors.push('templates: names no known map template');
  const loot = {};
  for (const [kind, path] of Object.entries(LOOT_PATHS)) {
    if (!files[path]) continue;
    for (const problem of checkLootTable(files[path])) errors.push(`${path}: ${problem}`);
    loot[kind] = files[path];
  }
  return {
    id: String(arena.id ?? ''),
    name: String(arena.name ?? arena.id ?? 'Pack'),
    description: String(arena.description ?? files['pack.mcmeta']?.pack?.description ?? ''),
    templates,
    generation: { palette, terrain, decorations, center, template_options: arena.template_options ?? {} },
    loot,
    errors,
  };
}

// --- loot tables -------------------------------------------------------------------------------------------------

const strip = (name) => String(name ?? '').replace(/^minecraft:/, '');
const between = (value, random, fallback = 1) => {
  if (Number.isFinite(value)) return Math.floor(value);
  if (value && Number.isFinite(value.min) && Number.isFinite(value.max)) return Math.floor(value.min + random() * (value.max - value.min + 1));
  return fallback;
};

/** Problems with a loot table: entries naming nothing the game has, functions it does not know. */
export function checkLootTable(table) {
  const problems = [];
  if (!Array.isArray(table?.pools)) return ['no pools'];
  table.pools.forEach((pool, i) => (pool.entries ?? []).forEach((entry, j) => {
    const type = strip(entry.type);
    if (type === 'empty') return;
    if (type !== 'item') { problems.push(`pools[${i}].entries[${j}]: entry type ${entry.type} is not supported`); return; }
    if (!resolveGameId(entry.name)) problems.push(`pools[${i}].entries[${j}]: no such item ${entry.name}`);
    for (const fn of entry.functions ?? []) {
      if (!['set_count', 'set_enchantments'].includes(strip(fn.function))) problems.push(`pools[${i}].entries[${j}]: function ${fn.function} is not supported`);
      for (const id of Object.keys(fn.enchantments ?? {})) if (!enchantmentEntry(strip(id), 1)) problems.push(`pools[${i}].entries[${j}]: no such enchantment ${id}`);
    }
  }));
  return problems;
}

/** Roll a vanilla loot table: the stacks it gives. */
export function rollLootTable(table, random) {
  const out = [];
  for (const pool of table?.pools ?? []) {
    if (!passes(pool.conditions, random)) continue;
    const entries = (pool.entries ?? []).filter((e) => passes(e.conditions, random));
    const total = entries.reduce((sum, e) => sum + Math.max(0, e.weight ?? 1), 0);
    if (total <= 0) continue;
    for (let n = between(pool.rolls, random); n > 0; n--) {
      let roll = random() * total;
      const entry = entries.find((e) => (roll -= Math.max(0, e.weight ?? 1)) < 0) ?? entries[entries.length - 1];
      if (strip(entry.type) !== 'item') continue;
      const resolved = resolveGameId(entry.name);
      if (!resolved) continue;
      const stack = { id: resolved.id, count: 1, isBlock: resolved.isBlock };
      for (const fn of entry.functions ?? []) {
        const kind = strip(fn.function);
        if (kind === 'set_count') stack.count = Math.max(1, Math.min(64, between(fn.count, random)));
        else if (kind === 'set_enchantments') {
          stack.enchantments = Object.entries(fn.enchantments ?? {}).map(([id, level]) => enchantmentEntry(strip(id), Math.max(1, between(level, random)))).filter(Boolean);
        }
      }
      out.push(stack);
    }
  }
  return out;
}

function passes(conditions, random) {
  for (const c of conditions ?? []) {
    if (strip(c.condition) === 'random_chance' && !(random() < (Number(c.chance) || 0))) return false;
  }
  return true;
}

// --- the packs this mod ships -------------------------------------------------------------------------------------

/** The bundled packs, in the order the lobby shows them: three made for each template. */
export const BUNDLED = Object.freeze([meadow, frozenPeaks, netherRift, tropicalAtoll, mushroomIsles, skyRuins,
  stoneKeep, desertFortress, endCitadel, sweetSlices, volcanicShards, cherryGrove]);

export const PACKS = new Map(BUNDLED.map((files) => { const pack = loadPack(files); return [pack.id, pack]; }));

/** The packs made for `template`, in order. */
export const packsFor = (template) => [...PACKS.values()].filter((p) => p.templates.includes(template));
export const defaultPackFor = (template) => packsFor(template)[0]?.id ?? [...PACKS.keys()][0];
