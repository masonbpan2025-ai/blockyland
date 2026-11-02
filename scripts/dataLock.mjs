// The pinned outside sources (data-lock.json), after Horizon's research-lock.json: every data and asset script fetches
// through these helpers, at an exact commit, so running a generator again gives the committed output until someone
// moves the pin on purpose.
//
//   import { rawUrl, contentsUrl, treeUrl, pin } from './dataLock.mjs';
//   rawUrl('minecraft-data', 'data/pc/1.21.4/blocks.json')
//
//   node scripts/dataLock.mjs                     show the pins
//   node scripts/dataLock.mjs --update mcmeta     move a pin to the newest commit of the ref it follows
//   node scripts/dataLock.mjs --update mcmeta --ref 1.21.5-data   ...or of another ref, which it then follows
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LOCK_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'data-lock.json');
export const SHA = /^[0-9a-f]{40}$/;

let cached = null;
export function readLock(path = LOCK_PATH) {
  if (path === LOCK_PATH && cached) return cached;
  const lock = JSON.parse(readFileSync(path, 'utf8'));
  if (path === LOCK_PATH) cached = lock;
  return lock;
}

/** One pinned source: { repo, commit, follows }. Throws for a name the lock does not have. */
export function pin(name, lock = readLock()) {
  const source = lock.sources?.[name];
  if (!source) throw new Error(`data-lock.json has no source "${name}". Known: ${Object.keys(lock.sources || {}).join(', ')}`);
  if (!SHA.test(source.commit)) throw new Error(`data-lock.json: "${name}" is pinned to "${source.commit}", not a full commit SHA`);
  return source;
}

const clean = path => String(path).replace(/^\/+/, '');

/** A file at the pinned commit, from raw.githubusercontent.com. */
export function rawUrl(name, path = '', lock) {
  const { repo, commit } = pin(name, lock);
  return `https://raw.githubusercontent.com/${repo}/${commit}/${clean(path)}`;
}

/** A directory listing at the pinned commit (GitHub contents API). */
export function contentsUrl(name, path = '', lock) {
  const { repo, commit } = pin(name, lock);
  return `https://api.github.com/repos/${repo}/contents/${clean(path)}?ref=${commit}`;
}

/** The whole tree at the pinned commit (GitHub git trees API). */
export function treeUrl(name, { recursive = true } = {}, lock) {
  const { repo, commit } = pin(name, lock);
  return `https://api.github.com/repos/${repo}/git/trees/${commit}${recursive ? '?recursive=1' : ''}`;
}

async function update(name, ref) {
  const lock = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
  const source = lock.sources[name];
  if (!source) throw new Error(`No source "${name}".`);
  const follows = ref || source.follows;
  const res = await fetch(`https://api.github.com/repos/${source.repo}/commits/${encodeURIComponent(follows)}`, {
    headers: { 'User-Agent': 'blockyland-data-lock', Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`${source.repo}@${follows}: HTTP ${res.status}`);
  const { sha } = await res.json();
  if (sha === source.commit) {
    console.log(`${name}: already at the newest ${follows} (${sha}).`);
    return;
  }
  console.log(`${name}: ${source.commit} -> ${sha} (${follows}). Regenerate what reads it and review the diff.`);
  Object.assign(source, { commit: sha, follows, pinnedOn: new Date().toISOString().slice(0, 10) });
  delete source.note;
  writeFileSync(LOCK_PATH, `${JSON.stringify(lock, null, 2)}\n`);
}

async function main(argv) {
  const at = argv.indexOf('--update');
  if (at >= 0) {
    const refAt = argv.indexOf('--ref');
    await update(argv[at + 1], refAt >= 0 ? argv[refAt + 1] : null);
    return;
  }
  for (const [name, source] of Object.entries(readLock().sources)) {
    console.log(`${name.padEnd(17)} ${source.repo}@${source.commit.slice(0, 12)} (follows ${source.follows}, pinned ${source.pinnedOn})`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('dataLock.mjs')) {
  main(process.argv.slice(2)).catch(err => { console.error(err.message); process.exit(1); });
}
