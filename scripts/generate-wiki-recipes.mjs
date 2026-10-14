// node scripts/generate-wiki-recipes.mjs
//
// The wiki's crafting and smelting recipes, as src/resourceWikiRecipes.js, for the recipe parity audit.
//
// Read from the {{Crafting}} and {{Smelting}} templates of every page scripts/fetch-resource-wiki.mjs saved, with
// "Any X" / "Matching X" groups expanded through Module:Inventory slot/Aliases (evaluated to JSON by
// scripts/wiki-lua-to-json.mjs). A template animates through its alternatives: frame i shows the i-th alternative
// of every slot and of the output, so each frame is one concrete recipe, and that is what is written.
// Repair recipes ("Damaged X") and templates marked ignoreusage are skipped.
import { readFileSync, writeFileSync } from 'node:fs';

const DIR = 'docs/block-item-audit/wiki';
const boxes = JSON.parse(readFileSync(`${DIR}/infoboxes.json`, 'utf8'));
const ALIASES = JSON.parse(readFileSync(`${DIR}/_modules/inventory_slot_aliases.json`, 'utf8'));

/** A template's parameters: positional list and named map, top-level pipes only. */
function params(template) {
  const body = template.replace(/^\{\{\s*\w+/, '').replace(/\}\}$/, '');
  const parts = []; let depth = 0; let cur = '';
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth++; cur += two; i++; continue; }
    if ((two === '}}' || two === ']]') && depth) { depth--; cur += two; i++; continue; }
    if (body[i] === '|' && !depth) { parts.push(cur); cur = ''; continue; }
    cur += body[i];
  }
  parts.push(cur);
  const positional = []; const named = {};
  for (const raw of parts.slice(1)) {
    const p = raw.replace(/<!--[\s\S]*?-->/g, '').trim();
    const m = /^([A-Za-z0-9 _]+?)\s*=([\s\S]*)$/.exec(p);
    if (m) named[m[1].trim().toLowerCase()] = m[2].trim();
    else if (p) positional.push(p);
  }
  return { positional, named };
}

/** One slot's alternatives as display names: "Coal; Charcoal", "Any Planks", "Oak Planks,4". */
function expand(text) {
  if (!text) return [];
  const out = [];
  for (const token of text.split(';').map((t) => t.trim())) {
    // An empty alternative ("; ; Gunpowder") is an empty slot in that frame of the animation.
    if (!token) { out.push({ name: null, count: 1 }); continue; }
    // "{Any golden tools}": the braces mark an alias group in a {{Smelting}} slot.
    const [name, count] = token.replace(/^\{(.*)\}$/, '$1').split(/\s*,\s*/);
    const alias = ALIASES[name.trim()];
    const names = alias === undefined ? [name.trim()] : [alias].flat().map((a) => (typeof a === 'string' ? a : a.name));
    for (const n of names) out.push({ name: n.replace(/^\d+×\s*/, ''), count: Number(count) || 1 });
  }
  return out;
}

const SLOTS = ['A1', 'B1', 'C1', 'A2', 'B2', 'C2', 'A3', 'B3', 'C3'];
const crafting = [];
const smelting = [];
const seen = new Set();
const pagesDone = new Set();
let skipped = 0;
for (const page of Object.values(boxes.pages)) {
  if (!page.title || pagesDone.has(page.title)) continue;
  pagesDone.add(page.title);
  for (const template of page.crafting ?? []) {
    const { positional, named } = params(template);
    if (named.ignoreusage || /Damaged /.test(template) || named.ingredients) { skipped++; continue; }
    // A recipe the template marks as another edition's only ({{only|bedrock|education}} in its name or description).
    const edition = `${named.name ?? ''} ${named.description ?? ''}`;
    if (/\{\{\s*only\s*\|\s*(be|bedrock|edu|education)/i.test(edition) && !/\{\{\s*only\s*\|[^}]*\b(je|java)\b/i.test(edition)) { skipped++; continue; }
    const shapeless = positional.length > 0;
    const slots = shapeless ? positional.map(expand) : SLOTS.map((s) => expand(named[s.toLowerCase()]));
    const output = expand(named.output);
    if (!output.length || slots.every((s) => !s.length)) { skipped++; continue; }
    const frames = Math.max(output.length, ...slots.map((s) => s.length));
    for (let i = 0; i < frames; i++) {
      const pick = (alts) => (alts.length ? alts[i % alts.length] : null);
      const grid = slots.map((alts) => pick(alts)?.name ?? null);
      const out = pick(output);
      if (!out?.name) continue;
      const recipe = { page: page.title, shapeless, grid, output: out.name, count: out.count };
      const key = JSON.stringify(recipe.grid) + recipe.output + recipe.count + shapeless;
      if (seen.has(key)) continue;
      seen.add(key);
      crafting.push(recipe);
    }
  }
  for (const template of page.smelting ?? []) {
    const { positional, named } = params(template);
    const inputs = expand(positional[0] ?? named.input);
    const outputs = expand(positional[1] ?? named.output);
    const xp = Number(String(positional[2] ?? named.experience ?? '').replace(',', '.'));
    const frames = Math.max(inputs.length, outputs.length);
    for (let i = 0; i < frames; i++) {
      const input = inputs[i % inputs.length]?.name; const output = outputs[i % outputs.length]?.name;
      if (!input || !output) continue;
      const key = `${input}>${output}`;
      if (seen.has(key)) continue;
      seen.add(key);
      smelting.push({ page: page.title, input, output, ...(Number.isFinite(xp) ? { xp } : {}) });
    }
  }
}

// Fuel: the Smelting page's fuel table, Template:Smelting table (saved by this script's first run with --fetch).
async function fuelTable() {
  const path = `${DIR}/smelting_table.json`;
  let json;
  try { json = JSON.parse(readFileSync(path, 'utf8')); } catch {
    const url = `https://minecraft.wiki/api.php?${new URLSearchParams({ action: 'parse', page: 'Template:Smelting table', prop: 'wikitext|revid', format: 'json', formatversion: '2' })}`;
    json = await (await fetch(url, { headers: { 'User-Agent': 'MinecraftInBrowserParityAudit/1.0' } })).json();
    writeFileSync(path, JSON.stringify(json));
  }
  const out = [];
  for (const row of json.parse.wikitext.split(/\n\|-/)) {
    const slot = /\{\{Slot\|([^|}]+)/.exec(row);
    const seconds = /\{\{Sort\|([\d.]+)/.exec(row);
    if (!slot || !seconds) continue;
    const edition = /\{\{only\|be\}\}/i.test(row) ? 'bedrock' : /\{\{only\|je\}\}/i.test(row) ? 'java' : null;
    if (edition === 'bedrock') continue;
    for (const { name } of expand(slot[1].trim())) out.push({ name, seconds: Number(seconds[1]) });
  }
  return { revid: json.parse.revid, fuels: out };
}
const fuel = await fuelTable();

// Fortune: the average drops per Fortune level, from the Fortune page's "Mineral Drops" table (Avg columns) and its
// discrete-random tables ("Average" rows), keyed by the block's name.
async function fortuneTable() {
  const path = `${DIR}/fortune_page.json`;
  let json;
  try { json = JSON.parse(readFileSync(path, 'utf8')); } catch {
    const url = `https://minecraft.wiki/api.php?${new URLSearchParams({ action: 'parse', page: 'Fortune', prop: 'wikitext|revid', format: 'json', formatversion: '2' })}`;
    json = await (await fetch(url, { headers: { 'User-Agent': 'MinecraftInBrowserParityAudit/1.0' } })).json();
    writeFileSync(path, JSON.stringify(json));
  }
  const text = json.parse.wikitext;
  const averages = {};
  const mineral = text.slice(text.indexOf('Mineral Drops'), text.indexOf('=== Discrete random'));
  for (const row of mineral.split(/\n\|-/)) {
    const name = /\{\{BlockLink\|([^}|]+)\}\}/.exec(row)?.[1];
    const cells = row.split('\n').filter((l) => /^\|[\d.]+\s*$/.test(l.trim())).map((l) => Number(l.trim().slice(1)));
    if (name && cells.length === 8) averages[name] = [cells[0], cells[2], cells[4], cells[6]];
  }
  const discrete = text.slice(text.indexOf('=== Discrete random'), text.indexOf('==== Short grass'));
  for (const table of discrete.split('{|').slice(1)) {
    const name = /\|\+\{\{BlockLink\|([^}|]+)\}\}/.exec(table)?.[1];
    // A table with maturity rows (nether wart, sweet berries) has more than one Average row: the last is the mature one.
    const rows = [...table.matchAll(/!Average\s*\n((?:![^\n]*\n?){4})/g)];
    if (!name || !rows.length) continue;
    const values = rows[rows.length - 1][1].split('\n').filter(Boolean).map((l) => Number(/[\d.]+/.exec(l)?.[0]));
    if (values.length === 4 && values.every(Number.isFinite)) averages[name.replace(/^./, (c) => c.toUpperCase())] = values;
  }
  return { revid: json.parse.revid, averages };
}
const fortune = await fortuneTable();

writeFileSync('src/resourceWikiRecipes.js', `// GENERATED by scripts/generate-wiki-recipes.mjs from the Minecraft Wiki's {{Crafting}} and {{Smelting}} templates
// (pages fetched ${boxes.fetched.slice(0, 10)}), "Any"/"Matching" groups expanded through Module:Inventory slot/Aliases.
// Grids are 3x3, row-major (A1 B1 C1 / A2 B2 C2 / A3 B3 C3), with display names; a shapeless recipe lists its
// ingredients. Do not edit by hand.

export const WIKI_CRAFTING = [
${crafting.map((r) => `  ${JSON.stringify(r)},`).join('\n')}
];

export const WIKI_SMELTING = [
${smelting.map((r) => `  ${JSON.stringify(r)},`).join('\n')}
];

/** Fuel burn time in a furnace, in seconds (Template:Smelting table, revision ${fuel.revid}; Bedrock-only rows left out). */
export const WIKI_FUEL = [
${fuel.fuels.map((r) => `  ${JSON.stringify(r)},`).join('\n')}
];
`);
console.log(`fuel ${fuel.fuels.length}`);
const fortuneOut = readFileSync('src/resourceWikiRecipes.js', 'utf8') + `
/** Average items dropped at Fortune 0, I, II, III (the Fortune page's tables, revision ${fortune.revid}), by block name. */
export const WIKI_FORTUNE_AVERAGES = ${JSON.stringify(fortune.averages, null, 1)};
`;
writeFileSync('src/resourceWikiRecipes.js', fortuneOut);
console.log('fortune', Object.keys(fortune.averages).join(', '));
console.log(`crafting ${crafting.length} recipes, smelting ${smelting.length}, skipped ${skipped} templates`);
