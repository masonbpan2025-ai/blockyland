// The Structure Inspector's start-screen entry point, and the seed comparison the page exists for.
//
// This pins the same two halves `mobInspectorEntry.test.js` and `resourceInspectorEntry.test.js` pin for the
// other two inspectors -- the button really opens the standalone page, and the page really drives the shared
// core -- plus the property that makes this inspector different from those two: changing the SEED and seeing
// what generation did differently. That comparison lives in a pure function so it can be tested without a DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { seedDiffView } from '../src/structureInspectorPanels.js';

const read = (p) => readFileSync(join(process.cwd(), p), 'utf8');
const html = read('index.html');
const mainJs = read('src/main.js');
const inspectorHtml = read('structure-inspector.html');
const inspectorJs = read('src/structureInspector.js');
const panelsJs = read('src/structureInspectorPanels.js');
const panelsUiJs = read('src/structureInspectorPanelsUi.js');

// --- the start-screen button -------------------------------------------------

test('the start screen offers a Structure Inspector button', () => {
  assert.match(html, /id="btn-start-structure-inspector"/, 'the button exists');
  assert.match(html, />\s*Structure Inspector\s*</, 'and is labelled Structure Inspector');
});

test('adding it left the other start-screen entries alone', () => {
  for (const id of ['btn-start-mob-inspector', 'btn-start-resource-inspector', 'btn-start-structure-studio', 'btn-start-new-world']) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} must survive`);
  }
  assert.ok(existsSync(join(process.cwd(), 'structure-inspector.html')), 'the page exists');
});

test('clicking the button leads to the Structure Inspector page', () => {
  // Pinned to the WIRING, not to the idiom. This used to require getElementById plus
  // btnStructureInspector.addEventListener, and it failed the moment the start screen was refactored
  // onto a bind(id, handler) helper -- a correct refactor breaking a test that tested its spelling.
  assert.match(mainJs, /btn-start-structure-inspector/, 'the button is bound by its id');
  assert.match(mainJs, /this\.openStructureInspector\(\)/, 'and it opens the Inspector');
  assert.match(mainJs, /openStructureInspector\(/, 'the method exists');
});

test('openStructureInspector navigates to the page and reports the URL', () => {
  const source = mainJs.slice(mainJs.indexOf('openStructureInspector({ structure = null'));
  const body = source.slice(0, source.indexOf('\n  }'));
  assert.match(body, /\/structure-inspector\.html/, 'it targets the Inspector page');
  assert.match(body, /window\.location\.href\s*=/, 'by navigating, not by starting a world');
  assert.match(body, /return url;/, 'and it reports the URL it used');
  // The structure and the seed travel in the query string, which is what makes a specific
  // structure-and-seed combination linkable from the start screen.
  assert.match(body, /params\.set\('structure'/, 'the structure is carried');
  assert.match(body, /params\.set\('seed'/, 'and so is the seed');
});

// --- the page honours the carried selection ----------------------------------

test('the page reads the structure and seed the start screen can carry', () => {
  assert.match(inspectorJs, /URLSearchParams\(window\.location\.search\)/, 'it reads the query string');
  assert.match(inspectorJs, /bootParams\.get\('structure'\)/, 'for the structure');
  assert.match(inspectorJs, /bootParams\.get\('seed'\)/, 'and for the seed');
  // A stale link must still open a working page: setStructure throws on an unknown id, so it is caught.
  assert.match(inspectorJs, /ignored the structure in the link/, 'an unknown structure is ignored, not fatal');
  assert.match(inspectorJs, /ignored the seed in the link/, 'and so is a malformed seed');
});

// --- the seed comparison, which is what this page is FOR ---------------------

test('the seed comparison is a pure function of two summaries', () => {
  // It must be assertable without a browser, and `structureInspectorPanels.js` is deliberately DOM-free.
  assert.match(panelsJs, /export function seedDiffView\(/, 'it is exported from the panels module');
  assert.doesNotMatch(panelsJs, /getElementById/, 'the panels module must not query the DOM');
  assert.doesNotMatch(panelsJs, /\bdocument\./, 'nor touch the document');
  assert.doesNotMatch(panelsJs, /from 'three'/, 'nor import a renderer');
});

test('the comparison distinguishes a MOVED structure from a CHANGED plan', () => {
  const base = { available: true, structureId: 'igloo', chunkX: 10, chunkZ: 4, pieces: 1, hash: 111, box: [1, 2, 3, 4, 5, 6] };

  // The structure moved: that is a PLACEMENT difference, which is a different claim from a layout difference.
  const moved = seedDiffView(base, { ...base, chunkX: 11, hash: 222 });
  assert.equal(moved.comparable, true);
  assert.equal(moved.chunkMoved, true);
  assert.match(moved.summary, /moved to chunk 11,4/);
  assert.match(moved.summary, /was 10,4/);

  // Same chunk, different hash: the structure's OWN randomness changed the variant at one site.
  const changedAtSameChunk = seedDiffView(base, { ...base, hash: 333 });
  assert.equal(changedAtSameChunk.chunkMoved, false);
  assert.equal(changedAtSameChunk.hashChanged, true);
  assert.match(changedAtSameChunk.summary, /plan changed at the same chunk/);

  // Nothing changed. A deterministic algorithm legitimately does this, and it is reported as such rather than
  // as an absence of information.
  const same = seedDiffView(base, { ...base });
  assert.equal(same.changed, false);
  assert.match(same.summary, /same result as the previous seed/);

  // Piece count and box are compared too, since two seeds can give the same hash-colliding size and a
  // genuinely different plan.
  const morePieces = seedDiffView(base, { ...base, pieces: 3, box: [1, 2, 3, 9, 5, 6], hash: 444 });
  assert.equal(morePieces.piecesChanged, true);
  assert.match(morePieces.summary, /pieces 1 to 3/);
});

test('the comparison refuses to compare things that are not comparable', () => {
  // No plan at all.
  assert.equal(seedDiffView(null, { available: false }).comparable, false);
  // The first plan for a selection is a BASELINE, not a change.
  const first = seedDiffView(null, { available: true, structureId: 'igloo', chunkX: 1, chunkZ: 1, pieces: 1, hash: 5, box: [] });
  assert.equal(first.comparable, false);
  assert.match(first.reason, /first plan/);
  // Two different structures are not a seed comparison, and calling them one would mislead a reader into
  // thinking the seed caused the difference.
  const other = seedDiffView(
    { available: true, structureId: 'igloo', chunkX: 1, chunkZ: 1, pieces: 1, hash: 5, box: [] },
    { available: true, structureId: 'bastion_remnant', chunkX: 9, chunkZ: 9, pieces: 4, hash: 7, box: [] }
  );
  assert.equal(other.comparable, false);
  assert.match(other.reason, /structure changed/);
});

test('the page compares against the PREVIOUS plan and renders the answer', () => {
  const ui = read('src/structureInspectorPanelsUi.js');
  assert.match(ui, /seedDiffView\(previous, summary\)/, 'the renderer asks for the comparison');
  assert.match(ui, /id=\"seed-diff\"|'seed-diff'/, 'and writes it into the panel');
  // The page keeps the last summary and hands it in, which is what makes "since the previous plan" true.
  assert.match(inspectorJs, /let lastSummary = null;/, 'the page keeps the previous summary');
  assert.match(inspectorJs, /previous: lastSummary/, 'and passes it to the renderer');
});

test('the page applies the seed on change, and can roll one', () => {
  // Flipping seeds must be ONE interaction rather than a text edit followed by a button press, and a reader
  // with no seed in mind needs a way to get one.
  assert.match(inspectorJs, /\$\('seed'\)\.onchange =/, 'the seed is applied when it changes');
  assert.match(inspectorJs, /btn-random-seed/, 'there is a Random seed button');
  assert.match(inspectorHtml, /id="btn-random-seed"/, 'and it exists on the page');
});

test('selecting another structure plans it rather than leaving the old plan on screen', () => {
  // The panels describe a plan, so a picker that changed the selection without planning would leave them
  // describing a structure the picker no longer shows.
  assert.match(inspectorJs, /planNearestAndRefresh\(\)/, 'there is a single plan-and-refresh path');
  // The boundary comes from the code's own structure rather than a character count. This was a magic 400 until
  // a CRLF checkout added one character per line and pushed the call just outside the window: a test that
  // depends on how many characters of comment precede the thing it checks is testing the comment.
  const onChange = inspectorJs.slice(inspectorJs.indexOf("$('structure').onchange"));
  const handler = onChange.slice(0, onChange.indexOf("$('btn-nearest')"));
  assert.match(handler, /session\.setStructure\(/, 'the picker selects the structure');
  assert.match(handler, /planNearestAndRefresh\(\)/, 'and plans it through the shared path');
});

test('every element the page looks up exists on the page', () => {
  // The guard the other two inspectors have: a panel referenced but not written renders as nothing, silently.
  // BOTH files are scanned, because the page script owns the controls and the panels renderer owns the panels,
  // and a lookup added to either one has to correspond to real markup.
  const ids = new Set();
  for (const source of [inspectorJs, panelsUiJs]) {
    for (const match of source.matchAll(/\$\('([a-z0-9-]+)'\)/g)) ids.add(match[1]);
  }
  const missing = [...ids].filter((id) => !new RegExp(`id="${id}"`).test(inspectorHtml));
  assert.deepEqual(missing, [], 'these ids are looked up but absent from the page: ' + missing.join(', '));
  for (const id of ['seed-diff', 'plan-summary', 'piece-graph', 'adaptation-info', 'btn-random-seed']) {
    assert.ok(ids.has(id), `${id} should be looked up by the page or its panel renderer`);
  }
});

test('the preview realizes as part of planning, so the blocks match the boxes', () => {
  // The bug this pins: picking a structure planned it but did NOT realize, so the preview kept the PREVIOUS
  // structure's blocks under the new plan's boxes. That reads as "the village generated a handful of blocks"
  // when nothing had been generated at all -- which is exactly how it was reported.
  const plan = inspectorJs.slice(inspectorJs.indexOf('function planNearestAndRefresh'));
  const body = plan.slice(0, plan.indexOf('\n}'));
  assert.match(body, /session\.planNearest\(/, 'it plans');
  assert.match(body, /session\.realize\(\)/, 'AND realizes in the same step');
  assert.match(body, /refresh\(/, 'then re-renders');
});

test('air is never drawn, because a stored air cell renders as a black cube', () => {
  // Air is black in the palette, so drawing it made a village look like black blocks. The renderer filters it
  // as well as the session, because this is the one rendering outcome that reads as a broken preview.
  const render = inspectorJs.slice(inspectorJs.indexOf('function renderBlocks'));
  const body = render.slice(0, render.indexOf('\n}'));
  assert.match(body, /filter\(\(\[, id\]\) => id !== BLOCKS\.AIR\)/, 'the renderer skips air');
});

test('the preview draws through the shared voxel geometry and material', () => {
  // The black-blob defect is tested BEHAVIOURALLY, on a real geometry, in structureInspectorGeometry.test.js.
  // What this pins is that the page cannot quietly go back to building its own geometry and material, which is
  // exactly how the defect arose: a bare BoxGeometry has no colour attribute, so a vertex-coloured material
  // reads a disabled attribute's default of zero and multiplies every block to black.
  const render = inspectorJs.slice(inspectorJs.indexOf('function renderBlocks'));
  const body = render.slice(0, render.indexOf('\n}'));
  assert.match(body, /createVoxelGeometry\(THREE\)/, 'the page uses the shared geometry');
  assert.match(body, /createVoxelMaterial\(THREE\)/, 'and the shared material');
  assert.match(body, /applyInstanceColours\(/, 'and the shared colour upload');
  assert.doesNotMatch(body, /new THREE\.BoxGeometry/, 'a bare BoxGeometry has no colour attribute');
  assert.doesNotMatch(body, /new THREE\.Mesh\w*Material/, 'the material must not be built inline either');
});
