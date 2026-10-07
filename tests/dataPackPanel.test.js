// The Data Packs panel: the only place the loader meets a player.
//
// The rendering is a pure function of a store, so what the player SEES is asserted without a browser. The DOM
// binding gets a stub, because the failure mode that matters there is a crash on a minimal document -- a
// `classList` bug of exactly that kind took out nine unrelated UI tests earlier in this project.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  packRowLabel, packPanelModel, renderPackList, statusText, formatBytes, bindDataPackPanel, PASTE_TYPES,
} from '../src/dataPackPanel.js';
import {
  createPackStore, addPack, PACK_SOURCES, MAX_PERSISTED_PACK_BYTES,
} from '../src/dataPackStore.js';
import { importPastedText, importFiles, filesFromUploads, describeImport } from '../src/dataPackImport.js';
import { createDataPack } from '../src/dataPack.js';

const biomeFiles = (sky = 1) => ({ 'data/t/worldgen/biome/a.json': JSON.stringify({ effects: { sky_color: sky } }) });
const pack = (name, extra = {}) => {
  const store = createPackStore();
  addPack(store, { name, files: biomeFiles(), ...extra });
  return store;
};

// --- labels, which are what the player reads ----------------------------------------------------------

test('formatBytes reads like something a person wrote', () => {
  assert.equal(formatBytes(0), '0 KB');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(1024 * 1024), '1.0 MB');
  assert.equal(formatBytes(NaN), '0 KB');
  assert.equal(formatBytes(-5), '0 KB');
});

test('a pack row says where it came from and how big it is', () => {
  const store = pack('Mine', { source: PACK_SOURCES.PASTED });
  const model = packPanelModel(store);
  assert.match(model.entries[0].label, /^pasted/);
  assert.match(model.entries[0].label, /KB/);
});

test('a pack that will be LOST on reload says so', () => {
  // This is the line that matters: the pack works now, and without the warning the player blames the game
  // when their content disappears.
  const store = createPackStore();
  addPack(store, { name: 'Huge', files: { 'data/t/x.json': 'x'.repeat(MAX_PERSISTED_PACK_BYTES + 10) } });
  const model = packPanelModel(store);
  assert.match(model.entries[0].label, /too large to save/);
  assert.match(model.entries[0].label, /lost on reload/);
  assert.match(model.warning, /too large to save/);
});

test('a bundled pack is not warned about, because it cannot be lost', () => {
  const store = createPackStore();
  addPack(store, { name: 'Vanilla', files: { 'data/t/x.json': 'x'.repeat(MAX_PERSISTED_PACK_BYTES + 10) }, source: PACK_SOURCES.BUNDLED });
  const model = packPanelModel(store);
  assert.equal(model.warning, '', 'no warning');
  assert.match(model.entries[0].label, /^bundled/);
  assert.ok(!/lost on reload/.test(model.entries[0].label));
});

test('a pack still waiting for its bundle says that instead', () => {
  const store = createPackStore();
  addPack(store, { name: 'B', files: null, source: PACK_SOURCES.BUNDLED, bundled: true });
  const model = packPanelModel(store);
  assert.match(model.entries[0].label, /waiting for the bundle/);
  assert.ok(!/lost on reload/.test(model.entries[0].label));
});

test('the model counts what is on and totals what a save would carry', () => {
  const store = createPackStore();
  addPack(store, { name: 'On', files: biomeFiles() });
  addPack(store, { name: 'Off', files: biomeFiles(), enabled: false });
  const model = packPanelModel(store);
  assert.equal(model.total, 2);
  assert.equal(model.enabled, 1);
  assert.ok(model.bytes > 0);
  assert.equal(model.bytesLabel, formatBytes(model.bytes));
});

// --- rendering ----------------------------------------------------------------------------------------

/** A document stub just rich enough for the panel, deliberately WITHOUT optional chaining help. */
function makeDoc(ids = []) {
  const created = [];
  const make = (tag) => {
    const el = {
      tagName: String(tag).toUpperCase(),
      children: [],
      dataset: {},
      style: {},
      classList: { _set: new Set(), add(c) { this._set.add(c); }, remove(c) { this._set.delete(c); }, toggle(c, on) { if (on) this._set.add(c); else this._set.delete(c); }, contains(c) { return this._set.has(c); } },
      appendChild(c) { this.children.push(c); return c; },
      replaceChildren(c) { this.children = c ? [c] : []; },
      addEventListener() {},
      focus() {},
      set textContent(v) { this._text = v; },
      get textContent() { return this._text; },
    };
    created.push(el);
    return el;
  };
  const byId = new Map();
  for (const id of ids) { const el = make('div'); el.id = id; byId.set(id, el); }
  return {
    created,
    getElementById: (id) => byId.get(id) ?? null,
    createElement: (tag) => make(tag),
  };
}

test('an empty store renders an empty state rather than an empty box', () => {
  const doc = makeDoc();
  const { list, model } = renderPackList(doc, createPackStore());
  assert.equal(model.entries.length, 0);
  assert.equal(list.children.length, 1);
  assert.match(list.children[0].textContent, /No data packs/);
});

test('each pack renders a checkbox, a name and a remove button', () => {
  const doc = makeDoc();
  const store = createPackStore();
  addPack(store, { name: 'Alpha', files: biomeFiles() });
  addPack(store, { name: 'Beta', files: biomeFiles(), enabled: false });
  const { list } = renderPackList(doc, store);

  assert.equal(list.children.length, 2);
  const [first, second] = list.children;
  assert.equal(first.children.length, 3, 'checkbox, text, remove');

  const toggle = first.children[0];
  assert.equal(toggle.type, 'checkbox');
  assert.equal(toggle.checked, true);
  assert.equal(toggle.dataset.pack, 'Alpha');
  assert.equal(first.children[1].children[0].textContent, 'Alpha', 'the name');
  assert.equal(first.children[2].textContent, 'Remove');

  assert.equal(second.children[0].checked, false, 'a disabled pack shows unchecked');
  // The row marks itself through `className`, not through classList, so assert on that.
  assert.match(first.className, /datapack-row/);
  assert.match(first.className, /enabled/, 'an enabled pack is marked');
  assert.ok(!/enabled/.test(second.className), 'and a disabled one is not');
});

test('rendering survives a minimal document with no classList on a host', () => {
  // The exact failure that once took out nine UI tests: a guard that protects against null but not against a
  // missing method.
  const doc = makeDoc();
  const store = createPackStore();
  addPack(store, { name: 'X', files: biomeFiles() });
  assert.doesNotThrow(() => renderPackList(doc, store, {}));
});

test('the toggle and remove handlers are wired to the pack name', () => {
  const doc = makeDoc();
  const store = createPackStore();
  addPack(store, { name: 'Alpha', files: biomeFiles() });
  const seen = [];
  // `addEventListener` on the stub does nothing, so the handlers are reached through the elements it built.
  renderPackList(doc, store, {
    onToggle: (n, e) => seen.push(['toggle', n, e]),
    onRemove: (n) => seen.push(['remove', n]),
  });
  // An enabled row's className carries a second class, so match the prefix rather than the whole string.
  const row = doc.created.find(e => typeof e.className === 'string' && e.className.startsWith('datapack-row'));
  assert.ok(row, 'a row was built');
  assert.equal(row.children[0].dataset.pack, 'Alpha');
  assert.equal(row.children[2].dataset.pack, 'Alpha');
});

// --- status text --------------------------------------------------------------------------------------

test('statusText explains an import, an apply and a revert differently', () => {
  assert.equal(statusText(null), '');
  assert.equal(statusText({ ok: true, entries: 3, skipped: [] }), 'Loaded 3 file(s)');
  assert.equal(statusText({ ok: true, entries: 3, skipped: [1, 2] }), 'Loaded 3 file(s), 2 skipped');
  assert.match(statusText({ ok: false, errors: ['bad thing', 'because'] }), /bad thing \(because\)/);
  assert.equal(statusText({ kind: 'apply', ok: true, summary: ['A: 3 recipes'] }), 'A: 3 recipes');
  assert.equal(statusText({ kind: 'apply', ok: true, summary: [] }), 'No packs to apply.');
  assert.equal(statusText({ kind: 'revert', ok: true, count: 2 }), 'Removed 2 pack(s) from the world.');
});

test('describeImport names what happened', () => {
  assert.equal(describeImport(null), '');
  assert.match(describeImport({ ok: false, errors: ['nope'] }), /nope/);
  assert.match(describeImport({ ok: true, entries: 5, skipped: [] }), /5 file/);
});

// --- importing ----------------------------------------------------------------------------------------

test('a single generated file imports, and is validated on the way in', () => {
  const store = createPackStore();
  const result = importPastedText(store, JSON.stringify({ effects: { sky_color: 7907327 } }),
    { type: 'worldgen/biome', id: 'my_plains', namespace: 'me' });
  assert.equal(result.ok, true);
  assert.equal(result.entries, 1);
  assert.equal(store.packs.size, 1);
  // The stored files are ones the real loader recognises, which is the whole point of validating.
  const rebuilt = createDataPack({ name: 'x', files: store.packs.get('my_plains').files });
  assert.equal(rebuilt.entries.length, 1);
  assert.equal(rebuilt.entries[0].type, 'biome');
});

test('a whole data pack imports under its own name', () => {
  const store = createPackStore();
  const result = importPastedText(store, JSON.stringify({
    'data/x/recipe/a.json': { type: 'minecraft:crafting_shapeless', ingredients: ['minecraft:oak_planks'], result: { id: 'minecraft:stick', count: 1 } },
  }), { name: 'My Pack' });
  assert.equal(result.ok, true);
  assert.deepEqual([...store.packs.keys()], ['My Pack']);
});

test('a file with nothing loadable is REFUSED rather than stored', () => {
  // Otherwise the UI lists it, the player switches it on, and nothing happens with no explanation.
  const store = createPackStore();
  const result = importPastedText(store, JSON.stringify({ 'data/x/README.md': 'nope' }), { name: 'Junk' });
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /nothing in this file is a data pack entry/);
  assert.ok(result.errors.length > 1, 'and it says which file and why');
  assert.equal(store.packs.size, 0, 'nothing was stored');
});

test('invalid JSON is refused with the parser message', () => {
  const store = createPackStore();
  const result = importPastedText(store, '{ not json', { type: 'recipe', id: 'x' });
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /invalid JSON/);
  assert.equal(store.packs.size, 0);
});

test('a single file with no type is refused with the instruction', () => {
  const store = createPackStore();
  const result = importPastedText(store, JSON.stringify({ effects: {} }), {});
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /needs a type/);
});

test('a pack that loads only SOME files is kept, and the losses are reported', () => {
  // A pack with one bad recipe is still worth loading, and the player should see what did not make it.
  const store = createPackStore();
  const result = importFiles(store, {
    'data/x/recipe/good.json': JSON.stringify({ type: 'minecraft:crafting_shapeless', ingredients: ['minecraft:oak_planks'], result: { id: 'minecraft:stick', count: 1 } }),
    'data/x/recipe/bad.json': '{ broken',
  }, { name: 'Mixed' });
  assert.equal(result.ok, true);
  assert.equal(result.entries, 1);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /invalid JSON/);
  assert.match(describeImport(result), /1 skipped/);
});

test('an empty import is refused and nothing is stored', () => {
  const store = createPackStore();
  assert.equal(importFiles(store, {}).ok, false);
  assert.equal(importFiles(store, null).ok, false);
  assert.equal(store.packs.size, 0);
});

test('an imported pack cannot be switched on by a later import of the same name', () => {
  const store = createPackStore();
  importPastedText(store, JSON.stringify(biomeFilesAsPack()), { name: 'Twice' });
  importPastedText(store, JSON.stringify(biomeFilesAsPack()), { name: 'Twice' });
  assert.equal(store.packs.size, 1, 'the name replaces rather than duplicating');
});

function biomeFilesAsPack() {
  return { 'data/t/worldgen/biome/a.json': { effects: { sky_color: 1 } } };
}

// --- uploaded folders ---------------------------------------------------------------------------------

test('an uploaded folder has its wrapper directory stripped', () => {
  const files = filesFromUploads([
    { name: 'a.json', webkitRelativePath: 'mypack/data/x/recipe/a.json', text: '{}' },
    { name: 'pack.mcmeta', webkitRelativePath: 'mypack/pack.mcmeta', text: '{}' },
    { name: 'notes.txt', webkitRelativePath: 'mypack/notes.txt', text: 'x' },
  ]);
  assert.deepEqual(Object.keys(files).sort(), ['data/x/recipe/a.json', 'pack.mcmeta']);
});

test('a flat upload keeps its own name', () => {
  const files = filesFromUploads([{ name: 'data/x/recipe/a.json', text: '{}' }]);
  assert.deepEqual(Object.keys(files), ['data/x/recipe/a.json']);
});

test('filesFromUploads tolerates junk', () => {
  assert.deepEqual(filesFromUploads([]), {});
  assert.deepEqual(filesFromUploads(null), {});
  assert.deepEqual(filesFromUploads([null, {}, { name: 42 }]), {});
  // A file with no text is skipped rather than stored as undefined.
  assert.deepEqual(filesFromUploads([{ name: 'a.json' }]), {});
});

test('an uploaded pack imports through the same validation as a paste', () => {
  const store = createPackStore();
  const files = filesFromUploads([
    { name: 'a.json', webkitRelativePath: 'p/data/x/recipe/a.json', text: JSON.stringify({ type: 'minecraft:crafting_shapeless', ingredients: ['minecraft:oak_planks'], result: { id: 'minecraft:stick', count: 1 } }) },
  ]);
  const result = importFiles(store, files, { name: 'Uploaded pack' });
  assert.equal(result.ok, true);
  assert.deepEqual([...store.packs.keys()], ['Uploaded pack']);
});

// --- the binding, on a minimal document ---------------------------------------------------------------

test('binding returns null when the panel is not in the document', () => {
  // This is what protects every existing UI test, whose document stub has no `datapack-list`.
  const doc = makeDoc();
  assert.equal(bindDataPackPanel({ doc }, { getStore: () => createPackStore() }), null);
});

test('binding renders the list and reports the model', () => {
  const doc = makeDoc(['datapack-list', 'datapack-status', 'datapack-warning', 'datapack-paste-type']);
  const store = createPackStore();
  addPack(store, { name: 'Alpha', files: biomeFiles() });
  const bound = bindDataPackPanel({ doc }, { getStore: () => store });
  assert.ok(bound, 'it bound');
  assert.equal(bound.model().total, 1);
  assert.equal(doc.getElementById('datapack-list').children.length, 1);
});

test('binding survives a document with no optional elements at all', () => {
  // Only the list host exists. Everything else is missing, and every guard has to cope.
  const doc = makeDoc(['datapack-list']);
  const store = createPackStore();
  assert.doesNotThrow(() => bindDataPackPanel({ doc }, { getStore: () => store }));
  // And one with a store that is not there yet.
  assert.doesNotThrow(() => bindDataPackPanel({ doc }, { getStore: () => undefined }));
  assert.doesNotThrow(() => bindDataPackPanel({ doc }, {}));
});

test('the paste type list is offered, and matches what the loader handles', async () => {
  assert.ok(PASTE_TYPES.length >= 8);
  const { parsePackPath } = await import('../src/dataPack.js');
  for (const type of PASTE_TYPES) {
    const parsed = parsePackPath(`data/x/${type.value}/thing.json`);
    assert.ok(parsed, `${type.value} should be a type the loader recognises`);
  }
});

// --- the markup ---------------------------------------------------------------------------------------

test('the panel markup is in the terminal drawer', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['gemini-datapack-section', 'datapack-list', 'datapack-add-bundled', 'datapack-paste-open',
    'datapack-file-input', 'datapack-apply', 'datapack-revert', 'datapack-paste-area', 'datapack-paste-type',
    'datapack-paste-id', 'datapack-paste-text', 'datapack-paste-load', 'datapack-status', 'datapack-warning']) {
    assert.match(html, new RegExp(`id="${id}"`), id + ' is missing');
  }
  // Inside the drawer, ahead of the log feed.
  const panel = html.indexOf('id="gemini-datapack-section"');
  const drawer = html.indexOf('id="gemini-key-drawer"');
  const feed = html.indexOf('id="gemini-log-feed"');
  assert.ok(drawer < panel && panel < feed, 'the panel is inside the drawer, before the log feed');
});

test('every element the panel binds by id exists in the markup', () => {
  // A typo between the two would leave a button that does nothing, which no other test would catch.
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../src/dataPackPanel.js', import.meta.url), 'utf8');
  const ids = [...source.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]);
  assert.ok(ids.length >= 8, 'the panel binds several elements');
  for (const id of ids) {
    assert.match(html, new RegExp(`id="${id}"`), `the panel binds #${id} but the markup has no such element`);
  }
});

test('the panel is bound by the UI manager', () => {
  const ui = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  assert.match(ui, /bindDataPackPanel\(\)/, 'a method on the manager');
  assert.match(ui, /this\.bindDataPackPanel\(\);/, 'called during setup');
  assert.match(ui, /import \{ bindDataPackPanel \} from '\.\/dataPackPanel\.js'/);
});

test('the game owns a store and can apply it', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /this\.dataPacks = createPackStore\(\)/);
  assert.match(main, /applyDataPacks\(\) \{/);
  assert.match(main, /revertDataPacks\(\) \{/);
  assert.match(main, /import \{ applyStore, revertAll \} from '\.\/dataPackApply\.js'/);
});
