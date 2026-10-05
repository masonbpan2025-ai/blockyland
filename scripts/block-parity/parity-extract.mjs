// Parity audit: turn the wiki Block page's block-list sections into a tracked fixture, and dump this
// game's registry for inspection.
//
//   node scripts/parity-audit/parity-fetch-wiki.mjs   refresh .cache/wiki from the wiki API
//   node scripts/parity-audit/parity-extract.mjs      rebuild tests/fixtures/wiki-block-list.json
//
// The fixture is committed so the parity tests and the gap report do not depend on the network, and so
// a change in the wiki's list shows up as a reviewable diff rather than as a moving target.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLOCKS, BLOCK_DEFS } from '../../src/blocks.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

// --- game registry dump ------------------------------------------------------
const entries = Object.entries(BLOCKS).filter(([k]) => k !== 'GRASS_BLOCK');
const rows = entries.map(([key, id]) => {
  const def = BLOCK_DEFS[id];
  return { key, id, defName: def ? def.name : null, hasDef: Boolean(def) };
});
rows.sort((a, b) => a.id - b.id || a.key.localeCompare(b.key));

const defKeys = new Set(Object.keys(BLOCK_DEFS).map(Number));
const idSet = new Set(entries.map(([, id]) => id));
const orphanDefs = [...defKeys].filter((k) => !idSet.has(k)).sort((a, b) => a - b);

const lines = ['# game block registry'];
lines.push(`# aliases: ${entries.length}  distinct ids: ${idSet.size}  defs: ${defKeys.size}`, '');
for (const r of rows) {
  lines.push([String(r.id).padStart(4), r.key.padEnd(32), r.hasDef ? 'def' : 'NODEF', r.defName ?? ''].join(' | '));
}
lines.push('', '# defs with no alias in BLOCKS: ' + orphanDefs.join(', '));
fs.writeFileSync(path.join(here, 'game-blocks.txt'), lines.join('\n'), 'utf8');

// --- wiki sections -> block names -------------------------------------------
const wikiDir = path.join(root, '.cache', 'wiki');
const SECTIONS = [
  ['item', 'section-5.txt'],
  ['technical', 'section-6.txt'],
  ['education', 'section-7.txt'],
  ['removed', 'section-8.txt'],
  ['joke', 'section-9.txt'],
];

/**
 * Pull the block name out of one `*[[File:...|size]] [[Name]]{{only|...}}` list item.
 *
 * The name is the display text of the FIRST wikilink that is not a File link, which is the block page.
 * A plain "strip all brackets" approach mangles rows whose display text continues after the link
 * ("[[Carrot]]s"), so the link is read structurally and any trailing text is appended.
 */
function parseListLine(raw) {
  if (!/^\*[^*]/.test(raw)) return null;
  let line = raw.replace(/^\*+\s*/, '');
  // Drop file links and templates first; neither contributes to the block name.
  line = line
    .replace(/\[\[File:[^\]]*\]\]/gi, '')
    .replace(/\{\{animate\|[^{}]*(\{[^{}]*\})?[^{}]*\}\}/gi, '')
    .replace(/\{\{only\|[^{}]*\}\}/gi, '')
    .replace(/\{\{in\|[^{}]*\}\}/gi, '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/'''?/g, '')
    .trim();
  if (!line) return null;

  const link = line.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  let name;
  let rest;
  if (link) {
    name = (link[2] || link[1]).trim();
    rest = line.slice(link[0].length);
  } else {
    // Some rows are plain text (an unlinked technical id such as `info_update`).
    name = line.replace(/\[\[|\]\]/g, '').trim();
    rest = '';
  }
  // Trailing text is part of the name only when it is short and not a sentence: "[[Carrot]]s" yes,
  // " (plus 15 colored variants)" no.
  const tail = rest.replace(/^[\s.,;:]+/, '').replace(/\[\[|\]\]/g, '').trim();
  if (tail && tail.length < 24 && !/[()]/.test(tail)) name = `${name}${tail.startsWith('s') ? tail : ' ' + tail}`;
  name = name.split('<')[0].trim();
  return name || null;
}

const sections = {};
const counts = {};
for (const [label, file] of SECTIONS) {
  const p = path.join(wikiDir, file);
  if (!fs.existsSync(p)) {
    console.warn(`  section ${label}: missing ${file} (run parity-fetch-wiki.mjs)`);
    sections[label] = [];
    continue;
  }
  const names = [];
  for (const raw of fs.readFileSync(p, 'utf8').split('\n')) {
    const name = parseListLine(raw);
    if (name && !names.includes(name)) names.push(name);
  }
  sections[label] = names;
  counts[label] = names.length;
}

const fixture = {
  source: 'https://minecraft.wiki/w/Block',
  note: 'Blocks with an item form, Technical blocks, Education blocks, Removed blocks, Joke blocks. '
    + 'Regenerate with scripts/parity-audit/parity-extract.mjs.',
  sections,
};
const fixturePath = path.join(root, 'tests/fixtures/wiki-block-list.json');
fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2) + '\n', 'utf8');

console.log('game aliases', entries.length, 'defs', defKeys.size);
console.log('wiki sections', JSON.stringify(counts));
