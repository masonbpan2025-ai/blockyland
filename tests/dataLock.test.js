// data-lock.json pins every outside data source to a commit, so a generator run again gives the committed output.
// These checks keep it that way: every pin is a full SHA, and no script fetches those repositories any other way.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLock, pin, rawUrl, contentsUrl, treeUrl, SHA } from '../scripts/dataLock.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPOS = /(PrismarineJS\/minecraft-data|PrismarineJS\/minecraft-assets|misode\/mcmeta)/;

function scriptFiles(dir = join(root, 'scripts'), out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) scriptFiles(path, out);
    else if (/\.(m?js|py)$/.test(name)) out.push(path);
  }
  return out;
}

test('every source is pinned to a full commit SHA', () => {
  const { sources } = readLock();
  assert.deepEqual(Object.keys(sources).sort(), ['mcmeta', 'minecraft-assets', 'minecraft-data']);
  for (const [name, source] of Object.entries(sources)) {
    assert.match(source.commit, SHA, name);
    assert.match(source.repo, /^[\w.-]+\/[\w.-]+$/, name);
    assert.ok(source.follows, `${name} records the ref it was resolved from`);
  }
});

test('the URL helpers name the pinned commit, never a branch', () => {
  const { commit } = pin('minecraft-data');
  assert.equal(rawUrl('minecraft-data', 'data/pc/1.21.4/blocks.json'),
    `https://raw.githubusercontent.com/PrismarineJS/minecraft-data/${commit}/data/pc/1.21.4/blocks.json`);
  assert.equal(rawUrl('minecraft-assets', '/data/1.20.2/items/').endsWith('/data/1.20.2/items/'), true, 'a leading slash is dropped, a trailing one kept');
  assert.match(contentsUrl('mcmeta', 'data/minecraft/worldgen/biome'), new RegExp(`\\?ref=${pin('mcmeta').commit}$`));
  assert.match(treeUrl('mcmeta'), new RegExp(`/git/trees/${pin('mcmeta').commit}\\?recursive=1$`));
  assert.throws(() => pin('nowhere'), /no source "nowhere"/);
  assert.throws(() => pin('x', { sources: { x: { repo: 'a/b', commit: 'master' } } }), /not a full commit SHA/);
});

test('no script fetches these repositories except through the lock', () => {
  const offenders = [];
  for (const file of scriptFiles()) {
    if (file.endsWith('dataLock.mjs')) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|#)/.test(line)) return; // comments may name the repositories
      if (/(raw\.githubusercontent\.com|api\.github\.com\/repos)\//.test(line) && REPOS.test(line)) {
        offenders.push(`${file.slice(root.length + 1)}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(offenders, [], 'fetch through rawUrl/contentsUrl/treeUrl from scripts/dataLock.mjs');
});
