// Generate the vanilla gameplay data tables from PrismarineJS/minecraft-data.
//
// The game needs canonical mining, loot and food numbers rather than hand-tuned ones. Rather
// than depend on minecraft-data at runtime (it is a Node package built for the real Java
// protocol, and would drag its loader into the browser bundle), this fetches the raw JSON
// once and emits plain ES modules that are committed and reviewable.
//
// Run with: node scripts/generate-mc-data.mjs
// Offline: pass --offline to reuse the cached raw JSON in .cache/mc-data.
//
// Data versions follow minecraft-data's own dataPaths.json mapping, which is why the loot
// table comes from pc/1.20 while blocks come from pc/1.21.4: that is the newest data each
// category has.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RAW = 'https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data';
const CACHE = join(process.cwd(), '.cache', 'mc-data');
const offline = process.argv.includes('--offline');

// Blocks: newest. Loot: minecraft-data's own mapping still points at pc/1.20.
const SOURCES = {
  blocks: `${RAW}/pc/1.21.4/blocks.json`,
  items: `${RAW}/pc/1.21.4/items.json`,
  entityLoot: `${RAW}/pc/1.20/entityLoot.json`,
  foods: `${RAW}/pc/1.21.1/foods.json`,
};

async function load(key) {
  const cached = join(CACHE, `${key}.json`);
  if (offline || (existsSync(cached) && offline)) {
    return JSON.parse(readFileSync(cached, 'utf8'));
  }
  if (existsSync(cached) && process.env.MC_DATA_REFRESH !== '1') {
    console.log(`  ${key}: using cache`);
    return JSON.parse(readFileSync(cached, 'utf8'));
  }
  console.log(`  ${key}: fetching`);
  const res = await fetch(SOURCES[key]);
  if (!res.ok) throw new Error(`${key}: HTTP ${res.status} from ${SOURCES[key]}`);
  const text = await res.text();
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(cached, text, 'utf8');
  return JSON.parse(text);
}

const header = (title, extra = '') => `// GENERATED FILE - do not edit by hand.
//
// ${title}
//
// Produced by scripts/generate-mc-data.mjs from PrismarineJS/minecraft-data
// (https://github.com/PrismarineJS/minecraft-data). Regenerate with:
//   node scripts/generate-mc-data.mjs
${extra ? '//\n' + extra.split('\n').map(l => '// ' + l).join('\n') + '\n' : ''}
`;

console.log('Fetching vanilla data...');
const blocks = await load('blocks');
const items = await load('items');
const entityLoot = await load('entityLoot');
const foods = await load('foods');

const itemNameById = new Map(items.map(i => [i.id, i.name]));

// --- 1. harvest data --------------------------------------------------------
// Harvest tiers, keyed by the vanilla tool item. minecraft-data lists harvestTools as a set
// of item ids; the tier order here is what decides whether a tool can harvest a block.
const TOOL_TIERS = ['wooden', 'stone', 'iron', 'golden', 'diamond', 'netherite'];
const TOOL_CLASSES = ['pickaxe', 'axe', 'shovel', 'hoe', 'shears', 'sword'];

/** Which tool class and minimum tier each harvestTools entry represents. */
function describeHarvestTools(harvestTools) {
  const ids = Object.keys(harvestTools || {});
  if (!ids.length) return null;
  for (const id of ids) {
    const name = itemNameById.get(Number(id));
    if (!name) continue;
    for (const cls of TOOL_CLASSES) {
      if (name.endsWith('_' + cls)) {
        const prefix = name.slice(0, -(cls.length + 1));
        if (TOOL_TIERS.includes(prefix)) return { tool: cls, tier: prefix };
        // shears have no tier prefix
        if (prefix === '') return { tool: cls, tier: 'any' };
      }
    }
  }
  return { tool: 'any', tier: 'any' };
}

/** The tool class a block's material implies, e.g. 'mineable/pickaxe' -> 'pickaxe'. */
function materialTool(material) {
  if (!material) return null;
  const m = /mineable\/(\w+)/.exec(material);
  return m ? m[1] : null;
}

// Only blocks the game can actually place are useful; skip fluid/technical entries with no
// hardness concept. Keep them out so the table stays focused and diffable.
const harvestRows = [];
for (const b of blocks) {
  if (b.diggable === false) continue;
  if (b.material === 'default' && b.hardness === 0 && b.boundingBox === 'empty' && !b.drops?.length) continue;
  const harvest = describeHarvestTools(b.harvestTools);
  const row = {
    name: b.name,
    hardness: b.hardness,
    tool: materialTool(b.material) || (harvest ? harvest.tool : null),
    tier: harvest && harvest.tier !== 'any' ? harvest.tier : null,
    // An empty drops array means the block drops itself; null means it drops nothing.
    drops: Array.isArray(b.drops) ? b.drops.map(id => itemNameById.get(id)).filter(Boolean) : null,
    requiresTool: Boolean(b.harvestTools && Object.keys(b.harvestTools).length),
    boundingBox: b.boundingBox,
    resistance: b.resistance ?? null,
  };
  harvestRows.push(row);
}
harvestRows.sort((a, b) => a.name.localeCompare(b.name));

const harvestBody = harvestRows.map(r => {
  const parts = [`hardness:${r.hardness}`];
  if (r.tool) parts.push(`tool:'${r.tool}'`);
  if (r.tier) parts.push(`tier:'${r.tier}'`);
  if (r.requiresTool) parts.push('requiresTool:true');
  if (r.drops) parts.push(`drops:${r.drops.length ? `['${r.drops.join("','")}']` : '[]'}`);
  if (r.boundingBox && r.boundingBox !== 'block') parts.push(`bb:'${r.boundingBox}'`);
  if (r.resistance !== null && r.resistance !== r.hardness) parts.push(`resistance:${r.resistance}`);
  return `  ${r.name}: {${parts.join(',')}},`;
}).join('\n');

writeFileSync('src/blockHarvestData.js', header(
  'Canonical per-block mining data: hardness, the tool class and minimum tier needed to',
  'harvest it, and what it drops.\n//\n// Used by the mining path to gate harvesting and to compute break times the way the real\n// game does, instead of the flat hardness/speed divide it used before.\n//\n// `drops` lists item names; an empty array means the block drops itself, and an absent\n// `drops` key means the block is not harvestable into an item.'
) + `import { BLOCKS } from './blocks.js';

export const BLOCK_HARVEST = {
${harvestBody}
};

/** Tool tiers from weakest to strongest, for comparing whether a tool can harvest a block. */
export const TOOL_TIER_ORDER = ['wooden', 'stone', 'iron', 'golden', 'diamond', 'netherite'];

const BY_ID = new Map();
for (const [name, data] of Object.entries(BLOCK_HARVEST)) {
  const id = BLOCKS[name.toUpperCase()];
  if (id !== undefined) BY_ID.set(id, { name, ...data });
}

/** Harvest data for a block id, or null when the block has no data. */
export function harvestDataFor(blockId) {
  return BY_ID.get(blockId) || null;
}

/** Every block id this table knows about, for tests and tooling. */
export function knownHarvestBlockIds() {
  return [...BY_ID.keys()];
}
`, 'utf8');
console.log(`  blockHarvestData.js: ${harvestRows.length} blocks`);

// --- 2. mob loot ------------------------------------------------------------
const lootRows = entityLoot
  .filter(e => Array.isArray(e.drops) && e.drops.length)
  .map(e => [e.entity, e.drops])
  .sort((a, b) => a[0].localeCompare(b[0]));

const lootBody = lootRows.map(([entity, drops]) => {
  const parts = drops.map(d => {
    const range = Array.isArray(d.stackSizeRange) ? d.stackSizeRange : [1, 1];
    // Fixed arity: [item, chance, count, flags]. The flags must always occupy the same slot,
    // or a consumer reading position 3 picks up a count instead. Trailing nulls are trimmed
    // because all four are always passed positionally at the call site.
    const chance = (d.dropChance !== undefined && d.dropChance < 1)
      ? String(+d.dropChance.toFixed(6))
      : 'null';
    const count = range[0] !== range[1]
      ? `'${range[0]}-${range[1]}'`
      : (range[0] !== 1 ? String(range[0]) : 'null');
    const flags = d.playerKill ? "'playerKill'" : 'null';
    const bits = [`'${d.item}'`, chance, count, flags];
    while (bits.length > 1 && bits[bits.length - 1] === 'null') bits.pop();
    return `[${bits.join(',')}]`;
  });
  return `  ${entity}: [${parts.join(',')}],`;
}).join('\n');

writeFileSync('src/mobLootData.js', header(
  'Canonical mob drops, from vanilla loot tables.',
  'Each entry is [item, chance, count, flags]. A missing chance means it always drops; a\n// missing count means one; a 0-0 count range means the drop scales with looting, which is\n// recorded as 0-0 and left to the caller. `playerKill` marks drops that only happen when a\n// player lands the kill.'
) + `export const MOB_LOOT = {
${lootBody}
};

/** Drop entries for a mob type, or an empty array when it drops nothing. */
export function lootFor(mobType) {
  return MOB_LOOT[mobType] || [];
}

/**
 * Roll a mob's drops.
 *
 * @param {string} mobType
 * @param {() => number} [random] injectable for deterministic tests
 * @param {{ playerKill?: boolean }} [options]
 * @returns {Array<{item: string, count: number}>}
 */
export function rollLoot(mobType, random = Math.random, options = {}) {
  const out = [];
  for (const [item, chance, count, flags] of lootFor(mobType)) {
    if (flags === 'playerKill' && !options.playerKill) continue;
    if (chance !== undefined && random() >= chance) continue;
    let n = 1;
    if (typeof count === 'number') n = count;
    else if (typeof count === 'string' && count.includes('-')) {
      const [lo, hi] = count.split('-').map(Number);
      n = lo + Math.floor(random() * (hi - lo + 1));
    }
    if (n > 0) out.push({ item, count: n });
  }
  return out;
}
`, 'utf8');
console.log(`  mobLootData.js: ${lootRows.length} mobs`);

// --- 3. foods ---------------------------------------------------------------
const foodRows = foods.slice().sort((a, b) => a.name.localeCompare(b.name));
const foodBody = foodRows.map(f => {
  const sat = f.saturation !== undefined ? +(f.saturation / 2).toFixed(2) : null;
  return `  ${f.name}: {hunger:${f.foodPoints}${sat !== null ? `,saturation:${sat}` : ''}},`;
}).join('\n');

writeFileSync('src/foodData.js', header(
  'Canonical food values: hunger restored and saturation.',
  'minecraft-data reports saturation in the doubled internal units the client uses; the values\n// here are halved back to the saturation points players see.'
) + `export const FOODS = {
${foodBody}
};

/** Food values for an item name, or null when the item is not edible. */
export function foodFor(itemName) {
  return FOODS[itemName] || null;
}
`, 'utf8');
console.log(`  foodData.js: ${foodRows.length} foods`);

console.log('Done.');
