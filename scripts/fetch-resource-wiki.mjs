// node scripts/fetch-resource-wiki.mjs
//
// Saves what the item and block parity audit reads from the Minecraft Wiki, under docs/block-item-audit/wiki/:
//   _modules/*.lua   the wiki's data modules: Module:Hardness values, Module:Blast resistance values and
//                    Module:Default data component/items (every item's default components: stack size,
//                    durability, food, attack and armour modifiers, rarity);
//   infoboxes.json   the {{Infobox block}} / {{Infobox item}} of the page each block and item of this game
//                    redirects to, with the page's revision, for the light level, tool and flammability.
// scripts/generate-resource-wiki-data.mjs turns them into src/resourceWikiData.js.
import { mkdirSync, writeFileSync } from 'node:fs';
import { registry as buildRegistry } from '../src/resourceRegistry.js';
import { BLOCK_DEFS } from '../src/blocks.js';
import { baseBlockName } from '../src/resourceWikiNames.js';

const DIR = 'docs/block-item-audit/wiki';
const API = 'https://minecraft.wiki/api.php';
const HEADERS = { 'User-Agent': 'MinecraftInBrowserParityAudit/1.0 (clean-room parity audit)' };
mkdirSync(`${DIR}/_modules`, { recursive: true });

async function query(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, { headers: HEADERS });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return await response.json();
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
}

const revisions = {};
for (const [title, file] of [
  ['Module:Hardness values', 'hardness.lua'],
  ['Module:Blast resistance values', 'blast_resistance.lua'],
  ['Module:Default data component/items', 'item_components.lua'],
]) {
  const json = await query({ action: 'query', prop: 'revisions', rvprop: 'content|ids|timestamp', rvslots: 'main', titles: title });
  const revision = json.query.pages[0].revisions[0];
  writeFileSync(`${DIR}/_modules/${file}`, revision.slots.main.content);
  revisions[title] = { revid: revision.revid, timestamp: revision.timestamp };
  console.log(title, revision.revid, revision.slots.main.content.length);
}

/** The {{Infobox ...}} template at the top of a page, braces balanced. */
function infobox(text) {
  const start = text.search(/\{\{\s*Infobox (block|item)/i);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length - 1; i++) {
    if (text[i] === '{' && text[i + 1] === '{') { depth++; i++; } else if (text[i] === '}' && text[i + 1] === '}') { depth--; i++; if (!depth) return text.slice(start, i + 1); }
  }
  return null;
}

/** Every {{breaking row}} on a page: the proper tool, minimum tier and whether the block drops itself. */
function breakingRows(text) {
  return [...text.matchAll(/\{\{\s*breaking row\s*\|([^{}]*(?:\{\{[^{}]*\}\}[^{}]*)*)\}\}/gi)].map((m) => m[1].replace(/\s+/g, ' ').trim());
}

/** Every {{Name ...}} template on the page (Crafting, Smelting), braces balanced, as its raw text. */
function templates(text, name) {
  const out = [];
  const re = new RegExp(`\\{\\{\\s*${name}\\s*(\\||\\n|\\}\\})`, 'gi');
  for (let m = re.exec(text); m; m = re.exec(text)) {
    let depth = 0;
    for (let i = m.index; i < text.length - 1; i++) {
      if (text[i] === '{' && text[i + 1] === '{') { depth++; i++; } else if (text[i] === '}' && text[i + 1] === '}') {
        depth--; i++;
        if (!depth) { out.push(text.slice(m.index, i + 1)); re.lastIndex = i + 1; break; }
      }
    }
  }
  return out;
}

/** Sentences naming Fortune, for the Fortune drop rules. */
function fortuneSentences(text) {
  return (text.match(/[^.\n]*\bFortune\b[^.\n]*\./g) ?? []).slice(0, 12).join(' ').slice(0, 2500) || null;
}

/** The page's "=== Breaking ===" section prose (Silk Touch and shears rules live there), up to the next heading. */
function breakingSection(text) {
  const m = /===\s*Breaking\s*===([\s\S]*?)(?=\n==)/i.exec(text);
  return m ? m[1].replace(/\{\{breaking row[\s\S]*?\}\}/gi, '').trim().slice(0, 2500) : null;
}

// Every display name the game uses, block and item, each asked for once; the wiki redirects variants
// ("Oak Planks") to the page that covers them ("Planks").
const names = new Set();
for (const entry of buildRegistry().entries.values()) {
  const name = entry.kind === 'block' ? entry.blockDef?.name : entry.name;
  if (name) names.add(name.replace(/\s*\([^)]*\)\s*$/, '').trim());
}
for (const def of Object.values(BLOCK_DEFS)) if (def?.name) { names.add(def.name); names.add(baseBlockName(def.name)); }
const list = [...names].sort();
const pages = {};
for (let i = 0; i < list.length; i += 50) {
  const batch = list.slice(i, i + 50);
  const json = await query({ action: 'query', prop: 'revisions', rvprop: 'content|ids', rvslots: 'main', redirects: '1', titles: batch.join('|') });
  const normalized = new Map((json.query.normalized ?? []).map((n) => [n.from, n.to]));
  const redirects = new Map((json.query.redirects ?? []).map((r) => [r.from, { to: r.to, fragment: r.tofragment ?? null }]));
  const byTitle = new Map(json.query.pages.map((p) => [p.title, p]));
  for (const name of batch) {
    const normal = normalized.get(name) ?? name;
    const redirect = redirects.get(normal);
    const page = byTitle.get(redirect?.to ?? normal);
    if (!page || page.missing || !page.revisions) { pages[name] = { missing: true }; continue; }
    const text = page.revisions[0].slots.main.content;
    pages[name] = { title: page.title, revid: page.revisions[0].revid, fragment: redirect?.fragment ?? null, infobox: infobox(text), breaking: breakingRows(text), breakingText: breakingSection(text),
      crafting: templates(text, 'Crafting'), smelting: templates(text, 'Smelting'), fortune: fortuneSentences(text) };
  }
  console.log(`pages ${Math.min(i + 50, list.length)}/${list.length}`);
}
writeFileSync(`${DIR}/infoboxes.json`, JSON.stringify({ fetched: new Date().toISOString(), modules: revisions, pages }, null, 1));
console.log('missing pages:', Object.entries(pages).filter(([, p]) => p.missing).map(([n]) => n).join(', '));
