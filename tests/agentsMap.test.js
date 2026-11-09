// The "Where things live" map in AGENTS.md is what agents read first. A row that names a moved or deleted file sends
// them to the wrong place, so every path and test group in it must exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREAS } from '../scripts/test.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT_DIRS = ['tests/', 'scripts/', 'docs/', 'e2e/', 'public/', 'server/', 'cloudflare/', 'src/', 'packages/', 'replication/'];
const PATH_LIKE = /(\/$|\.(js|mjs|html|css|md|json)$)/;

/** The map section: from its heading to the next one. */
export function mapSection(markdown) {
  const start = markdown.indexOf('## Where things live');
  assert.ok(start >= 0, 'AGENTS.md has no "Where things live" section');
  const end = markdown.indexOf('\n## ', start + 1);
  return markdown.slice(start, end < 0 ? undefined : end);
}

/** Backticked paths, resolved: under src/ unless they start with another top-level folder or are a root page. */
export function mapPaths(section) {
  const out = new Set();
  for (const [, token] of section.matchAll(/`([^`\s]+)`/g)) {
    if (!PATH_LIKE.test(token) || token.includes('*')) continue;
    const atRoot = ROOT_DIRS.some(d => token.startsWith(d)) || /^[\w-]+\.(html|md)$/.test(token) && !token.includes('/');
    out.add(atRoot ? token : `src/${token}`);
  }
  return [...out];
}

/** Group names in "group `mob`" and "groups `world`, `render` and `terrain`". */
export function mapGroups(section) {
  const out = new Set();
  for (const [, list] of section.matchAll(/groups? ((?:`\w+`(?:, | and )?)+)/g)) {
    for (const [, name] of list.matchAll(/`(\w+)`/g)) out.add(name);
  }
  return [...out];
}

const section = mapSection(readFileSync(join(root, 'AGENTS.md'), 'utf8'));

test('the map is read the way it is written', () => {
  const sample = '## Where things live\n| a | `mobs.js`, `worldgen/generators/`, `e2e/x.pw.js`, `index.html`, `cinema/CINEMA_GUIDELINES.md` | groups `world`, `render` and `terrain` |\n## Next';
  assert.deepEqual(mapPaths(mapSection(sample)),
    ['src/mobs.js', 'src/worldgen/generators/', 'e2e/x.pw.js', 'index.html', 'src/cinema/CINEMA_GUIDELINES.md']);
  assert.deepEqual(mapGroups(mapSection(sample)), ['world', 'render', 'terrain']);
});

test('every path in the AGENTS.md map exists', () => {
  const paths = mapPaths(section);
  assert.ok(paths.length > 80, `expected the map to name many files, found ${paths.length}`);
  const missing = paths.filter(p => !existsSync(join(root, p)));
  assert.deepEqual(missing, [], 'AGENTS.md "Where things live" names files that do not exist');
});

test('every test group in the AGENTS.md map exists in scripts/test.mjs', () => {
  const groups = mapGroups(section);
  assert.ok(groups.length > 10);
  assert.deepEqual(groups.filter(g => !AREAS[g]), []);
});
