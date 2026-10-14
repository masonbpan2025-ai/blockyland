// node scripts/generate-missing-content-doc.mjs [--refresh]
//
// Lists every vanilla block and item the game does not have, each with its wiki page, into docs/missing-content.md.
// The vanilla lists are the wiki's "Java Edition data values/Blocks" and ".../Items" pages (saved under
// docs/block-item-audit/wiki/; --refresh fetches them again). Whether a missing id is in the game's 1.21.4 target is
// read from the pinned .cache/mc-data list when it is present, only to label it.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { harvestDataFor } from '../src/blockHarvestData.js';
import { wikiItemIdFor } from '../src/resourceWikiAudit.js';
import { VANILLA_ID_ALIASES } from '../src/resourceRegistry.js';
import { FUTURE_BLOCK_DEFS, FUTURE_ITEMS } from '../src/futureContent.js';
import { parityAuditEverything } from '../src/resourceParityCases.js';

const DIR = 'docs/block-item-audit/wiki';
mkdirSync(DIR, { recursive: true });
const WIKI = 'https://minecraft.wiki/w/';

async function page(title, file) {
  const path = `${DIR}/${file}`;
  if (existsSync(path) && !process.argv.includes('--refresh')) return JSON.parse(readFileSync(path, 'utf8'));
  const url = `https://minecraft.wiki/api.php?${new URLSearchParams({ action: 'parse', page: title, prop: 'wikitext|revid', format: 'json', formatversion: '2' })}`;
  const json = await (await fetch(url, { headers: { 'User-Agent': 'MinecraftInBrowserParityAudit/1.0' } })).json();
  const saved = { title, revid: json.parse.revid, wikitext: json.parse.wikitext };
  writeFileSync(path, JSON.stringify(saved));
  return saved;
}

/** "[[Page|Shown]]" / "{{ItemLink|Shown|id=..|link=Page}}" -> { page, name }. */
function linkOf(cell) {
  let m = /\[\[(?!File:)([^|\]]+)(?:\|([^\]]+))?\]\]/.exec(cell);
  if (m) return { page: m[1].trim(), name: (m[2] ?? m[1]).trim() };
  m = /\{\{(?:Item|Block)Link\|([^}]*)\}\}/i.exec(cell);
  if (m) {
    const parts = m[1].split('|');
    const named = Object.fromEntries(parts.filter((p) => p.includes('=')).map((p) => p.split('=').map((s) => s.trim())));
    const positional = parts.filter((p) => !p.includes('='));
    const name = (positional[1] ?? positional[0] ?? '').trim();
    return { page: (named.link ?? positional[0] ?? name).trim(), name: name || positional[0] };
  }
  return null;
}

function rows(wikitext) {
  return wikitext.split(/\n\|-/).map((r) => r.trim()).filter((r) => r.startsWith('|') || r.startsWith('style'));
}

const blocksPage = await page('Java Edition data values/Blocks', 'data_values_blocks.json');
const itemsPage = await page('Java Edition data values/Items', 'data_values_items.json');

const vanillaBlocks = [];
for (const row of rows(blocksPage.wikitext)) {
  const id = /\{\{code\|([a-z0-9_]+)\}\}/.exec(row)?.[1];
  if (!id) continue;
  const cells = row.split('||');
  const link = linkOf(cells.find((c) => /\[\[(?!File:)|\{\{(Block|Item)Link/i.test(c)) ?? '');
  const snapshot = /background-color:\s*#008000/i.test(row);
  vanillaBlocks.push({ id, name: link?.name ?? id, page: link?.page ?? null, snapshot });
}
const vanillaItems = [];
for (const row of rows(itemsPage.wikitext)) {
  const id = /\{\{cd\|([a-z0-9_]+)\}\}/.exec(row)?.[1];
  if (!id) continue;
  const link = linkOf(row);
  vanillaItems.push({ id, name: link?.name ?? id, page: link?.page ?? null, snapshot: /background-color:\s*#008000/i.test(row) });
}

// What the game answers to: its block names (normalised) and harvest-row ids, its item ids and their vanilla ids.
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const haveBlocks = new Set();
// The post-1.21.4 content src/futureContent.js adds is listed apart: present, but new and not yet audited clean.
const futureBlockNames = new Set(Object.values(FUTURE_BLOCK_DEFS).map((d) => d?.name).filter(Boolean));
const futureItemIds = new Set(Object.keys(FUTURE_ITEMS));
for (const [id, def] of Object.entries(BLOCK_DEFS)) {
  if (!def?.name || futureBlockNames.has(def.name)) continue;
  haveBlocks.add(norm(def.name));
  const row = harvestDataFor(Number(id));
  if (row?.name) haveBlocks.add(row.name);
}
// Renamed in vanilla since this game's target: the chain became the iron chain (1.21.9).
for (const [alias, vanilla] of Object.entries({ ...VANILLA_ID_ALIASES, chain: 'iron_chain' })) if (haveBlocks.has(alias)) haveBlocks.add(vanilla);
const haveItems = new Set([...haveBlocks]);
for (const id of Object.keys(ITEMS)) { if (futureItemIds.has(id)) continue; haveItems.add(id); const v = wikiItemIdFor(id); if (v) haveItems.add(v); }

let pinned = null;
try {
  const blocks = JSON.parse(readFileSync('.cache/mc-data/blocks.json', 'utf8')).map((b) => b.name);
  const items = JSON.parse(readFileSync('.cache/mc-data/items.json', 'utf8')).map((i) => i.name);
  pinned = new Set([...blocks, ...items]);
} catch { /* no pinned data: versions are not labelled */ }

// What the parity audit still finds wrong with each added id (by its name or id), for the note column.
const audit = parityAuditEverything();
const failsFor = (x) => audit.failures.filter((r) => [x.id, x.name].includes(r.subject) || norm(r.subject) === norm(x.name)).map((r) => r.id);
const status = (x, added) => {
  if (!added) return ITEMS[x.id] ? 'the game has the item, but it cannot be placed as a block' : 'not in the game';
  const fails = [...new Set(failsFor(x))];
  return `added by src/futureContent.js${fails.length ? `; failing ${fails.join(', ')}` : ''}`;
};
const missingBlocks = vanillaBlocks.filter((b) => !haveBlocks.has(b.id) && !haveBlocks.has(norm(b.name)))
  .map((b) => ({ ...b, note: status(b, futureBlockNames.has(b.name) || Boolean(FUTURE_ITEMS[b.id])) }));
const missingItems = vanillaItems.filter((i) => !haveItems.has(i.id) && !haveItems.has(norm(i.name)))
  .map((i) => ({ ...i, note: status(i, futureItemIds.has(i.id)) }));
const url = (p) => (p ? `${WIKI}${encodeURIComponent(p.replace(/ /g, '_')).replace(/%2F/g, '/')}` : '');
const era = (id) => (pinned ? (pinned.has(id) ? '1.21.4 or earlier' : 'after 1.21.4') : '');
const table = (list) => [
  '| ID | Name | Wiki page | Version | Note |',
  '| --- | --- | --- | --- | --- |',
  ...list.map((x) => `| \`${x.id}\` | ${x.name} | ${x.page ? `[${x.page}](${url(x.page)})` : '—'} | ${era(x.id)}${x.snapshot ? ' (snapshot)' : ''} | ${x.note ?? ''} |`),
].join('\n');

const count = (list, when) => list.filter((x) => era(x.id) === when).length;
const doc = `# Missing blocks and items

Every vanilla Java Edition block and item that this game's own content does not have, each with its Minecraft Wiki
page. All of them are newer than the 1.21.4 target. Since this list was first made, \`src/futureContent.js\` has
registered them: the Note column says so, and names any wiki parity case (\`node scripts/wiki-audit.mjs\`) the added
block or item still fails. Generated
by \`node scripts/generate-missing-content-doc.mjs\` from the wiki's
[Java Edition data values/Blocks](${WIKI}Java_Edition_data_values/Blocks) (revision ${blocksPage.revid}) and
[Java Edition data values/Items](${WIKI}Java_Edition_data_values/Items) (revision ${itemsPage.revid}) pages.

A block counts as present when a block of this game has its id or display name; an item when an item or block of this
game answers to its id (this game's potions, tipped arrows and wall/bed-head placements map onto vanilla's ids).
The version column says whether the id is in the pinned Java 1.21.4 data this game targets.

| | Vanilla | Missing | of which in 1.21.4 | after 1.21.4 |
| --- | --- | --- | --- | --- |
| Blocks | ${vanillaBlocks.length} | ${missingBlocks.length} | ${count(missingBlocks, '1.21.4 or earlier')} | ${count(missingBlocks, 'after 1.21.4')} |
| Items (not sharing a block id) | ${vanillaItems.length} | ${missingItems.length} | ${count(missingItems, '1.21.4 or earlier')} | ${count(missingItems, 'after 1.21.4')} |

## Missing blocks (${missingBlocks.length})

${table(missingBlocks)}

## Missing items (${missingItems.length})

Items whose id is also a block id are listed with the blocks above.

${table(missingItems)}
`;
writeFileSync('docs/missing-content.md', doc);
console.log(`vanilla blocks ${vanillaBlocks.length}, missing ${missingBlocks.length}; vanilla items ${vanillaItems.length}, missing ${missingItems.length}`);
console.log('missing in 1.21.4:', [...missingBlocks, ...missingItems].filter((x) => era(x.id) === '1.21.4 or earlier').map((x) => x.id).join(' '));
