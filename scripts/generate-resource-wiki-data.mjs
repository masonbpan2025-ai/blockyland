// node scripts/generate-resource-wiki-data.mjs
//
// Turns what scripts/fetch-resource-wiki.mjs saved from the Minecraft Wiki into src/resourceWikiData.js, the
// fact table the item and block parity audit (src/resourceWikiAudit.js) compares the game against:
//   * hardness and blast resistance by display name (Module:Hardness values, Module:Blast resistance values);
//   * each item's default components by id (Module:Default data component/items): stack size, durability,
//     food, attack damage and speed, armour, toughness, knockback resistance, enchantability, rarity, fire
//     resistance;
//   * the light level, tool and flammability from the {{Infobox block}} of the page each game name redirects
//     to, read per variant where the page lists variants with {{BlockSprite}} lines.
// Only names and ids the game uses are kept, plus every vanilla item id (so a missing item is visible).
import { readFileSync, writeFileSync } from 'node:fs';
import { registry as buildRegistry } from '../src/resourceRegistry.js';
import { BLOCK_DEFS } from '../src/blocks.js';
import { baseBlockName } from '../src/resourceWikiNames.js';

const DIR = 'docs/block-item-audit/wiki';
const read = (file) => readFileSync(`${DIR}/${file}`, 'utf8');

// --- a small Lua table reader ----------------------------------------------------------------------------
function parseLua(source) {
  const text = source.replace(/--\[\[[\s\S]*?\]\]/g, '').replace(/--[^\n]*/g, '');
  let i = 0;
  const ws = () => { while (i < text.length && /\s/.test(text[i])) i++; };
  const value = () => {
    ws();
    const ch = text[i];
    if (ch === '{') return table();
    if (ch === '"' || ch === "'") return string();
    const m = /^(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|true|false|nil)/i.exec(text.slice(i, i + 40));
    if (!m) throw new Error(`lua: unexpected ${text.slice(i, i + 30)}`);
    i += m[0].length;
    return m[0] === 'true' ? true : m[0] === 'false' ? false : m[0] === 'nil' ? null : Number(m[0]);
  };
  const string = () => {
    const quote = text[i++];
    let out = '';
    while (text[i] !== quote) { if (text[i] === '\\') { out += text[i + 1]; i += 2; } else out += text[i++]; }
    i++;
    return out;
  };
  const table = () => {
    i++;
    const obj = {}; const arr = [];
    for (;;) {
      ws();
      if (text[i] === '}') { i++; break; }
      let key = null;
      if (text[i] === '[') { i++; ws(); key = string(); ws(); i++; ws(); i++; } else {
        const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/.exec(text.slice(i, i + 120));
        if (m) { key = m[1]; i += m[0].length; }
      }
      const v = value();
      if (key === null) arr.push(v); else obj[key] = v;
      ws();
      if (text[i] === ',' || text[i] === ';') i++;
    }
    return arr.length && !Object.keys(obj).length ? arr : (arr.length ? { ...obj, _: arr } : obj);
  };
  const start = text.search(/(local\s+\w+\s*=\s*|return\s*)\{/);
  i = text.indexOf('{', start);
  return table();
}

// --- the game's names -------------------------------------------------------------------------------------
const registry = buildRegistry();
const gameNames = new Set();
const gameItemIds = new Set();
for (const entry of registry.entries.values()) {
  if (entry.kind === 'item') { gameNames.add(entry.name); gameItemIds.add(entry.id); }
}
const blockNames = new Set(Object.values(BLOCK_DEFS).map((d) => d?.name).filter(Boolean));

// --- hardness and blast resistance --------------------------------------------------------------------------
function nameTable(file) {
  const out = {};
  for (const [name, v] of Object.entries(parseLua(read(file)))) {
    const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
    if (Number.isFinite(n)) out[name] = n;
  }
  return out;
}
const hardness = nameTable('_modules/hardness.lua');
const blast = nameTable('_modules/blast_resistance.lua');

// --- item components ------------------------------------------------------------------------------------------
const components = parseLua(read('_modules/item_components.lua'));
const items = {};
for (const [id, wrapper] of Object.entries(components)) {
  const c = wrapper.c ?? {};
  const row = { stack: c.max_stack_size ?? 64 };
  if (c.max_damage) row.durability = c.max_damage;
  // A food component without a consumable one is not eaten by the player (a fish bucket's feeds a nautilus).
  if (c.food && c.consumable) row.food = [c.food.nutrition ?? 0, Math.round((c.food.saturation ?? 0) * 100) / 100];
  for (const m of [c.attribute_modifiers ?? []].flat()) {
    if (!m || typeof m !== 'object' || !m.type) continue;
    const amount = Math.round(m.amount * 1000) / 1000;
    if (m.type === 'minecraft:attack_damage') row.attack = Math.round((1 + amount) * 1000) / 1000;
    else if (m.type === 'minecraft:attack_speed') row.attackSpeed = Math.round((4 + amount) * 100) / 100;
    else if (m.type === 'minecraft:armor') row.armor = amount;
    else if (m.type === 'minecraft:armor_toughness') row.toughness = amount;
    else if (m.type === 'minecraft:knockback_resistance') row.knockbackResistance = amount;
  }
  if (c.enchantable?.value) row.enchantability = c.enchantable.value;
  if (c.rarity) row.rarity = c.rarity;
  if (c.damage_resistant && /is_fire/.test(JSON.stringify(c.damage_resistant))) row.fireResistant = true;
  if (c.damage_resistant && /is_explosion/.test(JSON.stringify(c.damage_resistant))) row.explosionResistant = true;
  if (c.equippable?.slot) row.slot = c.equippable.slot;
  items[id] = row;
}

// --- infoboxes ------------------------------------------------------------------------------------------------
const boxes = JSON.parse(read('infoboxes.json'));

/** The raw value of `| field = ...` in an infobox, up to the next field. */
function field(box, name) {
  const m = new RegExp(`\\n\\s*\\|\\s*${name}\\s*=([\\s\\S]*?)(?=\\n\\s*\\|\\s*[a-z0-9]+\\s*=|\\n\\}\\}\\s*$)`, 'i').exec(box);
  return m ? m[1].trim() : null;
}

/** A field's value for one variant: the `*{{BlockSprite|Name}} ... value` line naming it, or the whole value. */
function forVariant(raw, name) {
  if (raw === null) return null;
  const lines = raw.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.some((l) => /\{\{(Block|Item)Sprite\|/i.test(l))) return raw;
  for (const l of lines) {
    const sprites = [...l.matchAll(/\{\{(?:Block|Item)Sprite\|([^}|]+)/gi)].map((m) => m[1].trim().toLowerCase());
    if (sprites.includes(name.toLowerCase())) return l.replace(/^\*+/, '').replace(/\{\{(?:Block|Item)Sprite\|[^}]*\}\}/gi, '').trim();
  }
  return undefined; // a per-variant list that does not name this variant
}

const strip = (s) => s.replace(/<small>.*?<\/small>/gi, '').replace(/&nbsp;/g, ' ').replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1').replace(/'''/g, '').trim();

/** Light: a number when the infobox gives one plain level, else null (conditional: lit, candles, charge...). */
function parseLight(raw) {
  if (raw === null || raw === undefined) return null;
  // "Yes (9) <small>(when lit)</small>": a level that depends on the block's state is not one number.
  if (/when|\blit\b|active|charge|candle|depends/i.test(raw)) return null;
  const s = strip(raw);
  if (/^(no|none|0)$/i.test(s)) return 0;
  const m = /^yes\s*\((\d+)\)\s*$/i.exec(s);
  return m ? Number(m[1]) : null;
}

const TOOLS = ['pickaxe', 'axe', 'shovel', 'hoe', 'sword', 'shears', 'brush'];
/** Tool: { tools: [...], tier } -- tier set when the infobox names a minimum material ("wooden pickaxe"). */
function parseTool(raw) {
  if (raw === null || raw === undefined) return null;
  const s = strip(raw).toLowerCase();
  if (/^(any|none|n\/a)$/.test(s)) return { tools: [], tier: null };
  if (/\{\{|<br|\n/.test(raw) && !/^[a-z ]+$/.test(s)) {
    // A template or several lines: keep the tool words, drop the tier (too ambiguous to pin).
    const tools = TOOLS.filter((t) => new RegExp(`\\b${t}s?\\b`).test(s));
    return tools.length ? { tools, tier: null, mixed: true } : null;
  }
  const m = /^(wooden|stone|iron|golden|diamond|netherite)\s+(\w+)$/.exec(s);
  if (m) return { tools: [m[2]], tier: m[1] };
  const tools = TOOLS.filter((t) => new RegExp(`\\b${t}s?\\b`).test(s));
  return tools.length ? { tools, tier: null } : null;
}

/**
 * Transparent (does light pass through it) in Java Edition: 'yes', 'no' or 'partial'; null when the infobox gives
 * no plain answer (a double slab's line, an unlabelled edition split).
 */
function parseTransparent(raw) {
  if (raw === null || raw === undefined) return null;
  let s = raw;
  const jebe = /\{\{\s*jebe\s*\|([^|}]*)/i.exec(s);
  if (jebe) s = jebe[1];
  const je = /(?:\[\[)?JE(?:\]\])?'*\s*:\s*([^<]*)/.exec(s) ?? /\{\{JE\}\}\s*:\s*([^<]*)/.exec(s);
  if (je) s = je[1];
  if (/double slab/i.test(s)) return null;
  s = strip(s).toLowerCase();
  if (/^yes\b/.test(s)) return 'yes';
  if (/^no\b/.test(s)) return 'no';
  if (/^partial/.test(s)) return 'partial';
  return null;
}

function parseFlammable(raw) {
  if (raw === null || raw === undefined) return null;
  const s = strip(raw);
  if (/^no\b/i.test(s)) return false;
  if (/^yes\b/i.test(s)) return true;
  return null;
}

// --- {{breaking row}}: proper tool, minimum tier, drops itself ---------------------------------------------------
const GRADES = { wood: 'wooden', wooden: 'wooden', stone: 'stone', iron: 'iron', gold: 'golden', golden: 'golden', diamond: 'diamond', netherite: 'netherite' };

/** One {{breaking row}}'s parameters, split into rows when it uses `;` for several. */
function breakingRowsOf(raw) {
  const parts = raw.split('|').map((p) => p.trim());
  const positional = []; const named = {};
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq > 0 && /^[a-z0-9 ]+$/i.test(p.slice(0, eq).trim())) named[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim();
    else positional.push(p);
  }
  const splitN = (v, n) => (v === undefined ? Array(n).fill(undefined) : v.includes(';') ? v.split(';').map((x) => x.trim()) : Array(n).fill(v));
  const names = (positional[0] ?? '').split(';').map((x) => x.trim());
  const n = names.length;
  const tools = splitN(positional[1], n); const grades = splitN(positional[2], n);
  const drops = splitN(named.drop, n); const shears = splitN(named.shears, n);
  return names.map((group, i) => ({
    names: group.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean),
    tool: (tools[i] ?? 'any').toLowerCase(),
    tier: GRADES[(grades[i] ?? '').toLowerCase()] ?? null,
    drop: drops[i] ?? null,
    shears: shears[i] ?? null,
  }));
}

/**
 * What the Breaking section's prose says Silk Touch does, in Java Edition: true when a sentence naming Silk Touch
 * says the block drops itself / can be obtained, false when one says it does not ("even with Silk Touch",
 * "drops nothing"), null when no sentence says either. Sentences about Bedrock Edition alone are skipped.
 */
function silkFromProse(text) {
  if (!text) return null;
  let verdict = null;
  const sentences = text.replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, '').split(/(?<=[.!?])\s+/);
  for (const raw of sentences) {
    // A sentence about a variant the game does not name separately ("The snowy grass variant cannot be obtained").
    if (!/silk touch/i.test(raw) || /snowy/i.test(raw)) continue;
    const s = raw.replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1');
    if (/\{\{\s*(in|only)\s*\|\s*(be|bedrock)/i.test(s) && !/\{\{\s*(in|only)\s*\|\s*(je|java)/i.test(s)) continue;
    // A sentence about breaking it *without* Silk Touch says nothing about what Silk Touch does.
    const withoutSilk = /without (a |the )?(\w+ )?silk touch|not enchanted with silk touch|other than a silk touch|non-silk touch|no silk touch/i.test(s);
    if (/even with (the use of )?silk touch|with silk touch drops nothing|cannot be recollected|does not allow for collection/i.test(s)) return false;
    if (withoutSilk) continue;
    if (/drops? (itself|the ore block|as an item)|can be obtained|obtained (only )?(by|with|using|when)|can only be obtained|be retrieved|obtained as an item|drops itself|it drops itself|always drops (itself|a single)|instead drops itself|block itself drops|equivalent non-infested/i.test(s)) verdict = true;
  }
  return verdict;
}

/** The breaking row for a name on its page: the row naming it, else the page's only row. */
function breakingFor(page, name) {
  const rows = (page.breaking ?? []).flatMap(breakingRowsOf);
  if (!rows.length) return null;
  const want = [name, baseBlockName(name), page.title].map((s) => s.toLowerCase());
  const row = rows.find((r) => r.names.some((n) => want.includes(n))) ?? (rows.length === 1 ? rows[0] : null);
  if (!row) return null;
  const tool = ['any', 'none', ''].includes(row.tool) ? 'any' : row.tool;
  // Drops itself when broken with the proper tool and no Silk Touch: not when the row says drop=0 (stone gives
  // cobblestone, glass nothing) and not when shears=1 marks shears as the way to collect it.
  return { tool, tier: row.tier, selfDrop: row.drop !== '0', ...(row.shears === '1' ? { shears: true } : {}) };
}

const infobox = {};
const pages = {};
for (const [name, page] of Object.entries(boxes.pages)) {
  if (page.missing || !page.infobox) continue;
  pages[page.title] = page.revid;
  const row = { page: page.title };
  const light = parseLight(forVariant(field(page.infobox, 'light'), name));
  if (light !== null) row.light = light;
  // `tool`, `tool2`, `tool3`: every tool the infobox names (cobweb: shears and sword; leaves: shears and hoe).
  const tools = ['tool', 'tool2', 'tool3'].map((f) => parseTool(forVariant(field(page.infobox, f), name))).filter(Boolean);
  if (tools.length) {
    const named = [...new Set(tools.flatMap((t) => t.tools))];
    const tier = tools.find((t) => t.tier)?.tier ?? null;
    row.tool = { tools: named, tier, ...(tools.some((t) => t.mixed) ? { mixed: true } : {}) };
  }
  const transparent = parseTransparent(forVariant(field(page.infobox, 'transparent'), name));
  if (transparent !== null) row.transparent = transparent;
  const flammable = parseFlammable(forVariant(field(page.infobox, 'flammable'), name));
  if (flammable !== null) row.flammable = flammable;
  const kind = /\{\{\s*Infobox block/i.test(page.infobox) ? 'block' : 'item';
  row.kind = kind;
  const breaking = breakingFor(page, name);
  if (breaking) {
    const silk = silkFromProse(page.breakingText);
    row.breaking = silk === null ? breaking : { ...breaking, silk };
  }
  infobox[name] = row;
}

// --- per block name: the wiki's facts, found through the page it redirects to --------------------------------
const blocks = {};
const unresolved = { hardness: [], blast: [], infobox: [] };
for (const name of [...blockNames].sort()) {
  const base = baseBlockName(name);
  const box = infobox[name] ?? infobox[base] ?? null;
  const keys = [name, base, box?.page].filter(Boolean).map((k) => k.toLowerCase());
  const row = { page: box?.page ?? null };
  if (base !== name) row.base = base;
  const hk = keys.find((k) => k in hardness);
  if (hk !== undefined) { row.hardness = hardness[hk]; if (hk !== name.toLowerCase()) row.hardnessKey = hk; } else unresolved.hardness.push(name);
  const bk = keys.find((k) => k in blast);
  if (bk !== undefined) { row.blast = blast[bk]; if (bk !== name.toLowerCase()) row.blastKey = bk; } else unresolved.blast.push(name);
  if (box) {
    if ('light' in box) row.light = box.light;
    if (box.tool) row.tool = box.tool;
    if ('flammable' in box) row.flammable = box.flammable;
    if (box.breaking) row.breaking = box.breaking;
    if (box.transparent) row.transparent = box.transparent;
  } else unresolved.infobox.push(name);
  blocks[name] = row;
}

const NL = '\n';
const out = `// GENERATED by scripts/generate-resource-wiki-data.mjs from the Minecraft Wiki -- do not edit by hand.
// Sources (revisions pinned): ${Object.entries(boxes.modules).map(([t, r]) => `${t} rev ${r.revid}`).join('; ')};
// plus the {{Infobox block}} / {{Infobox item}} of ${Object.keys(pages).length} pages, fetched ${boxes.fetched.slice(0, 10)}.
// Refresh: node scripts/fetch-resource-wiki.mjs && node scripts/generate-resource-wiki-data.mjs

export const WIKI_MODULE_REVISIONS = ${JSON.stringify(boxes.modules)};

/**
 * The wiki's facts for each block name this game uses: the page the name redirects to, hardness and blast
 * resistance (Module:Hardness values / Module:Blast resistance values, looked up by the name, its base name
 * without state words, then the page title -- the key used is kept when it is not the name itself), and the
 * light level, tool and flammability from the page's infobox (a light of null there is conditional: lit,
 * candles, charge).
 */
export const WIKI_BLOCKS = {
${Object.entries(blocks).map(([n, row]) => `  ${JSON.stringify(n)}: ${JSON.stringify(row)},`).join(NL)}
};

/** Each vanilla item's default components (Module:Default data component/items), by id. */
export const WIKI_ITEMS = {
${Object.entries(items).sort(([a], [b]) => a.localeCompare(b)).map(([id, row]) => `  ${id}: ${JSON.stringify(row)},`).join(NL)}
};

/** The page each item name redirects to. */
export const WIKI_ITEM_PAGES = ${JSON.stringify(Object.fromEntries([...gameNames].sort().filter((n) => infobox[n]).map((n) => [n, infobox[n].page])))};

/** The revision of each page read. */
export const WIKI_PAGE_REVISIONS = ${JSON.stringify(pages)};
`;
writeFileSync('src/resourceWikiData.js', out);
console.log(`blocks ${Object.keys(blocks).length}, items ${Object.keys(items).length}, pages ${Object.keys(pages).length}; ${(out.length / 1024).toFixed(0)} KB`);
for (const [k, v] of Object.entries(unresolved)) console.log(`no wiki ${k} for ${v.length}:`, v.join(', '));
const unknownItems = [...gameItemIds].filter((id) => !items[id]);
console.log('game item ids with no wiki component row:', unknownItems.length, unknownItems.join(', '));
