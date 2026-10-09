// Parity audit: turn the wiki Item page's item-list sections into a tracked fixture.
//
//   node scripts/parity-audit/item-fetch-wiki.mjs   refresh .cache/wiki/item-section-*.txt
//   node scripts/parity-audit/item-extract.mjs      rebuild tests/fixtures/wiki-item-list.json
//
// The fixture is committed so the parity report does not depend on the network, and so a change in
// the wiki's list shows up as a reviewable diff rather than as a moving target.
//
// Scope: the four in-game lists (sections 7-10). Minecraft Education items (11), Unimplemented (13),
// Removed (14) and Joke (16) items are captured under `excluded` for reporting only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const wikiDir = path.join(root, '.cache', 'wiki');

// source section index -> report bucket
const SECTIONS = [
  [7, 'creates', 'Items that create blocks, fluids, entities'],
  [8, 'useInWorld', 'Items with use in the world'],
  [9, 'indirectUse', 'Items with indirect use in the world'],
  [10, 'spawnEggs', 'Spawn eggs'],
];
const EXCLUDED = [
  [11, 'education', 'Minecraft Education items'],
  [13, 'unimplemented', 'Unimplemented items'],
  [14, 'removed', 'Removed items'],
  [16, 'joke', 'Joke items'],
];

/**
 * Pull the item name out of one `* {{ItemLink|Name}}...` / `*{{InvLink|Name}}` list row.
 *
 * The name is the first positional parameter of the link template. Everything after the template is
 * a qualifier ({{only|...}}, {{upcoming|...}}, {{note|...}}, a second template) and is recorded
 * separately so the report can tell a platform-exclusive item from a plain one.
 */
function parseListLine(raw) {
  if (!/^\*[^*]/.test(raw)) return null;
  const m = raw.match(/\{\{(?:Item|Inv|Block)Link\s*\|([^}|]+)([^}]*)\}\}/);
  if (!m) return null;
  const name = m[1].trim();
  if (!name) return null;
  const tail = raw.slice(raw.indexOf(m[0]) + m[0].length);
  const only = (tail.match(/\{\{only\|([^}|]*)/i) || [])[1] || null;
  const upcoming = /\{\{upcoming/i.test(tail)
    ? (tail.match(/\{\{upcoming\|([^}|]*)/i) || [])[1] || 'yes'
    : null;
  const notes = [...tail.matchAll(/\{\{note\|([^}|]*)/gi)].map((n) => n[1]);
  return { name, only: only ? only.trim().toLowerCase() : null, upcoming, notes };
}

/** `==== Heading ====` / `=== Heading ===` on its own line. */
function headingOf(line) {
  const m = line.match(/^(={3,4})\s*(.+?)\s*\1\s*$/);
  return m ? m[2].replace(/'''?/g, '').trim() : null;
}

const sections = {};
for (const [index, key, label] of SECTIONS) {
  const p = path.join(wikiDir, `item-section-${index}.txt`);
  if (!fs.existsSync(p)) {
    console.warn(`  section ${index} (${label}): missing (run item-fetch-wiki.mjs)`);
    sections[key] = { label, groups: {} };
    continue;
  }
  const groups = {};
  let group = label;
  const seen = new Set();
  for (const raw of fs.readFileSync(p, 'utf8').split('\n')) {
    const h = headingOf(raw);
    if (h) { group = h; continue; }
    const row = parseListLine(raw);
    if (!row) continue;
    const dedupe = `${group}|${row.name}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    (groups[group] ||= []).push(row);
  }
  sections[key] = { label, groups };
}

const excluded = {};
for (const [index, key, label] of EXCLUDED) {
  const p = path.join(wikiDir, `item-section-${index}.txt`);
  if (!fs.existsSync(p)) { excluded[key] = { label, names: [] }; continue; }
  const names = [];
  for (const raw of fs.readFileSync(p, 'utf8').split('\n')) {
    const row = parseListLine(raw);
    if (row && !names.includes(row.name)) names.push(row.name);
  }
  excluded[key] = { label, names };
}

const counts = {};
for (const [key, v] of Object.entries(sections)) {
  counts[key] = Object.values(v.groups).reduce((n, g) => n + g.length, 0);
}

const fixture = {
  source: 'https://minecraft.wiki/w/Item',
  fetched: new Date().toISOString().slice(0, 10),
  note: 'In-scope vanilla item lists (sections 7-10). `excluded` holds Minecraft Education, '
    + 'Unimplemented, Removed and Joke items for reporting only. '
    + 'Regenerate with scripts/parity-audit/item-extract.mjs.',
  counts,
  sections,
  excluded,
};
const fixturePath = path.join(root, 'tests/fixtures/wiki-item-list.json');
fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2) + '\n', 'utf8');

console.log('wiki in-scope entries', JSON.stringify(counts));
console.log('excluded', JSON.stringify(Object.fromEntries(
  Object.entries(excluded).map(([k, v]) => [k, v.names.length])
)));
