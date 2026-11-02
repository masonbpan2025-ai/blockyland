import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTree, publishableFiles, assetFilesOnDisk, ASSETS_PREFIX, PROVENANCE_PATH } from '../scripts/checkPublicTree.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const provenance = {
  folders: { 'packs/hd/': { source: 'vanilla-derived', by: 'scripts/x.py' } },
  entries: [
    { source: 'vanilla', files: ['blocks/dirt.png'] },
    { source: 'generated', by: 'scripts/y.mjs', files: ['items/cushion.png'] },
  ],
};
const ok = ['src/main.js', 'public/assets/blocks/dirt.png', 'public/assets/items/cushion.png', 'public/assets/packs/hd/dirt.png', PROVENANCE_PATH];

test('a tree where every asset is accounted for passes, counted by source', () => {
  const { errors, counts } = checkTree({ files: ok, provenance });
  assert.deepEqual(errors, []);
  assert.deepEqual(counts, { vanilla: 1, generated: 1, 'vanilla-derived': 1 });
});

test('an asset added without provenance fails', () => {
  const { errors } = checkTree({ files: [...ok, 'public/assets/blocks/new_block.png'], provenance });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /blocks\/new_block\.png: no provenance/);
});

test('game code is refused anywhere in the tree', () => {
  const { errors } = checkTree({ files: [...ok, 'tools/client.jar', 'decomp/net/minecraft/World.java', 'x/A.CLASS'], provenance });
  assert.equal(errors.length, 3);
  assert.ok(errors.every(e => /game code/.test(e)));
});

test('a provenance entry for a deleted file, or a file listed twice, fails', () => {
  const stale = { ...provenance, entries: [...provenance.entries, { source: 'unknown', files: ['blocks/gone.png', 'blocks/dirt.png'] }] };
  const { errors } = checkTree({ files: ok, provenance: stale });
  assert.equal(errors.length, 2);
  assert.ok(errors.some(e => /gone\.png, which no longer exists/.test(e)));
  assert.ok(errors.some(e => /dirt\.png is listed twice/.test(e)));
});

test('the repository itself passes', () => {
  const real = JSON.parse(readFileSync(join(root, PROVENANCE_PATH), 'utf8'));
  const files = [...new Set([...publishableFiles().filter(f => !f.startsWith(ASSETS_PREFIX)), ...assetFilesOnDisk()])];
  const { errors } = checkTree({ files, provenance: real });
  assert.deepEqual(errors.slice(0, 10), []);
});
