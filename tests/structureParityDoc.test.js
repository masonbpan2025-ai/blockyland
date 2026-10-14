// The parity matrix must not drift from the registry it describes.
//
// `tests/docsParityFigures.test.js` exists because a parity document once reported 421 of 1557 recipes
// while the real figure was 99%, and a stale document is worse than no document: it reads as current and
// gets cited. The structure matrix has the same failure mode -- a structure added to the registry but
// absent from the matrix is invisible work, and an id renamed in code would leave the document pointing
// at a structure that no longer exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { STRUCTURES, STRUCTURE_SETS } from '../src/worldgen/registry.js';
import { generatorCoverage } from '../src/worldgen/index.js';

const DOC = 'docs/STRUCTURE_PARITY.md';

test('every registry structure appears in the parity matrix', () => {
  const doc = readFileSync(DOC, 'utf8');
  const missing = Object.keys(STRUCTURES).filter((id) => !doc.includes(`\`${id}\``));
  assert.deepEqual(missing, [], `these registered structures are absent from ${DOC}: ${missing.join(', ')}`);

  // ...and the matrix has exactly one row per structure id. A row count that drifts from the registry is
  // how a document starts claiming a structure it no longer describes (or vice versa). Only the matrix
  // section is scanned, and only the second column counts: prose rows elsewhere in the document also
  // mention ids, and counting those made this check report three phantom rows when it was first written.
  const matrix = doc.slice(doc.indexOf('## Matrix'));
  const ids = new Set(Object.keys(STRUCTURES));
  const rows = matrix.split('\n').filter((line) => {
    if (!line.startsWith('| ')) return false;
    const idCell = line.split('|')[2]?.trim() ?? '';
    const match = /^`([^`]+)`$/.exec(idCell);
    return match ? ids.has(match[1]) : false;
  });
  assert.equal(rows.length, ids.size,
    `the matrix has ${rows.length} rows for ${ids.size} registry ids; the count in the document is stale`);
});

test('every structure set has a home in the matrix', () => {
  // The sets are shared infrastructure; the document must say which ones exist so a reader can tell
  // "no placement" from "no layout".
  const doc = readFileSync(DOC, 'utf8');
  assert.match(doc, /Random-spread and concentric-rings placement/,
    'the document must describe the placement infrastructure that already exists');
  assert.equal(STRUCTURE_SETS.filter((set) => !set.feature).length, 20, 'the registry is expected to carry the 20 vanilla sets');
});

test('the document states the target version and does not claim unverified parity', () => {
  const doc = readFileSync(DOC, 'utf8');
  assert.match(doc, /Minecraft Java Edition 1\.21\.4/, 'the target version must be stated');
  // The mission is explicit that visual similarity is not evidence. Until a differential test exists, no
  // matrix ROW may be VERIFIED. The check is restricted to rows naming a registry structure, because the
  // status-vocabulary table above the matrix legitimately contains the word itself.
  const ids = new Set(Object.keys(STRUCTURES));
  const offenders = doc.split('\n').filter((line) => {
    if (!line.startsWith('| ') || !/`VERIFIED`/.test(line)) return false;
    return [...ids].some((id) => line.includes(`\`${id}\``));
  });
  assert.deepEqual(offenders, [], `these rows claim VERIFIED with no vanilla comparison: ${offenders.join(' | ')}`);
  for (const status of ['NOT STARTED', 'INFRASTRUCTURE BLOCKED', 'PARTIAL', 'FUNCTIONAL', 'NEAR PARITY', 'VERIFIED']) {
    assert.ok(doc.includes(status), `the status vocabulary is missing ${status}`);
  }
});

test('the matrix agrees with the code about what is implemented', () => {
  const doc = readFileSync(DOC, 'utf8');
  const matrix = doc.slice(doc.indexOf('## Matrix'));
  const rowFor = (id) => matrix.split('\n').find((line) => line.split('|')[2]?.trim() === `\`${id}\``);
  const { implemented, missing } = generatorCoverage();

  // Every structure with a generator must be marked as working...
  for (const id of implemented) {
    const row = rowFor(id);
    assert.ok(row, `${id} has a generator but no matrix row`);
    assert.match(row, /`(FUNCTIONAL|PARTIAL|NEAR PARITY|VERIFIED)`/,
      `${id} has a generator but the matrix does not say it works`);
  }
  // ...and nothing without one may be. This is the assertion that would have caught a stale row after the
  // first structure landed, which is exactly what happened when the igloo was added.
  for (const id of missing) {
    const row = rowFor(id);
    if (!row) continue;
    assert.doesNotMatch(row, /`(FUNCTIONAL|PARTIAL|NEAR PARITY|VERIFIED)`/,
      `${id} has no generator but the matrix says it works`);
  }
  assert.ok(implemented.length >= 2, 'at least buried treasure and the igloo are implemented');
});
