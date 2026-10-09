// The World Generation Pack dropdown in the Create New World menu.
//
// The presets were built and tested before anything offered them. This covers the menu itself: that the
// options come from the preset list rather than a hand-written copy of it, that choosing one reaches world
// creation, that changing it REPLACES rather than stacks, and that the choice survives a save.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UIManager } from '../src/ui.js';
import { GENERATION_PRESETS, generationPresetList, getGenerationPreset, buildPresetPack }
  from '../src/dataPackPresets.js';
import { normaliseSettings, DEFAULT_SETTINGS } from '../src/sessionSettings.js';
import { createPackStore, allPacks, addPack, PACK_SOURCES } from '../src/dataPackStore.js';
import { captureSessionState, applySessionState, SAVE_VERSION } from '../src/saveSchema.js';
import { applyStore, revertAll } from '../src/dataPackApply.js';
import { revertDataPack, resetTagRegistry } from '../src/dataPackRuntime.js';
import { BIOMES } from '../src/biomes.js';
import { BLOCKS } from '../src/blocks.js';
import { enabledStructureIds, WORLD_STRUCTURE_IDS } from '../src/worldStructures.js';

/** A select stub that records its options and its listeners, like the panel tests do. */
function makeDom(ids) {
  const byId = new Map();
  const make = (tag) => {
    const el = {
      tagName: String(tag).toUpperCase(),
      options: [],
      children: [],
      value: '',
      dataset: {},
      listeners: {},
      style: {},
      classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, on) { if (on) this._s.add(c); else this._s.delete(c); }, contains(c) { return this._s.has(c); } },
      appendChild(c) { this.children.push(c); if (c?.tagName === 'OPTION') this.options.push(c); return c; },
      addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
      async fire(type) { for (const fn of this.listeners[type] ?? []) await fn(); },
      set textContent(v) { this._t = v; },
      get textContent() { return this._t; },
    };
    return el;
  };
  for (const id of ids) { const el = make('select'); el.id = id; byId.set(id, el); }
  return { byId, getElementById: (id) => byId.get(id) ?? null, createElement: (tag) => make(tag) };
}

/** Bind the dropdown onto a minimal `this`, without constructing a whole UIManager. */
function bind(dom, game = {}) {
  const ui = {
    worldDataPackSelect: dom.getElementById('world-datapack-select'),
    worldDataPackHint: dom.getElementById('world-datapack-hint'),
    game,
    selectedDataPackPreset: null,
  };
  const doc = globalThis.document;
  globalThis.document = dom;
  try {
    UIManager.prototype.bindDataPackPresetSelect.call(ui);
  } finally {
    globalThis.document = doc;
  }
  return ui;
}

// --- the markup ----------------------------------------------------------------------------------------

test('the dropdown is in the create-world modal, ahead of the biome card', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="world-datapack-select"/);
  assert.match(html, /id="world-datapack-hint"/);
  // Inside the world-creation modal, before the biome information card.
  const select = html.indexOf('id="world-datapack-select"');
  const modal = html.indexOf('id="world-biome-modal"');
  const card = html.indexOf('id="biome-info-card"');
  assert.ok(modal < select, 'inside the create-world modal');
  assert.ok(select < card, 'and before the biome card');
  // It sits after the difficulty choice, so the order is mode -> difficulty -> pack.
  assert.ok(html.indexOf('id="world-difficulty-section"') < select);
});

test('every element the binding looks up exists in the markup', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  const ids = [...source.matchAll(/getElementById\('(world-datapack-[a-z-]+)'\)/g)].map(m => m[1]);
  assert.ok(ids.length >= 2, 'the binding looks up the select and the hint');
  for (const id of ids) assert.match(html, new RegExp(`id="${id}"`), `#${id} is missing from the markup`);
});

// --- the options ---------------------------------------------------------------------------------------

test('the dropdown offers vanilla plus all available presets', () => {
  const dom = makeDom(['world-datapack-select', 'world-datapack-hint']);
  const ui = bind(dom);
  const select = dom.getElementById('world-datapack-select');
  // Eleven: the "no pack" default and the ten presets.
  assert.equal(select.options.length, 1 + GENERATION_PRESETS.length);
  assert.equal(select.options[0].value, '', 'the first entry selects no preset');
  assert.match(select.options[0].textContent, /Vanilla \(default\)/);
  const values = select.options.slice(1).map(o => o.value);
  assert.deepEqual(values, GENERATION_PRESETS.map(p => p.id), 'one option per preset, in order');
  assert.equal(new Set(values).size, GENERATION_PRESETS.length);
});

test('every option label states the property, so the menu is readable without trying each one', () => {
  const dom = makeDom(['world-datapack-select', 'world-datapack-hint']);
  bind(dom);
  const select = dom.getElementById('world-datapack-select');
  for (const option of select.options.slice(1)) {
    const preset = getGenerationPreset(option.value);
    assert.ok(option.textContent.includes(preset.name), `${option.value} shows its name`);
    assert.ok(option.textContent.includes(preset.emoji), `${option.value} shows its icon`);
    assert.ok(option.textContent.includes(preset.property), `${option.value} states its property`);
  }
});

test('the options come from the preset list rather than a hand-written copy', () => {
  // A hard-coded list of ten is a list that goes stale the first time a preset is renamed.
  const dom = makeDom(['world-datapack-select', 'world-datapack-hint']);
  bind(dom);
  const select = dom.getElementById('world-datapack-select');
  assert.deepEqual(select.options.slice(1).map(o => o.value), generationPresetList().map(e => e.id));
});

test('the hint describes the default and then whatever is chosen', async () => {
  const dom = makeDom(['world-datapack-select', 'world-datapack-hint']);
  bind(dom);
  const select = dom.getElementById('world-datapack-select');
  const hint = dom.getElementById('world-datapack-hint');
  assert.match(hint.textContent, /standard overworld/i, 'the default says what it is');

  select.value = 'lush_havens';
  await select.fire('change');
  assert.match(hint.textContent, /Frequent, varied wildlife/, 'the blurb is shown');
  assert.match(hint.textContent, /structure types/, 'and how much it builds');
  assert.ok(!hint.textContent.includes('undefined'), 'the hint shows an actual structure count');
});

test('choosing a preset records it, and vanilla clears it', async () => {
  const dom = makeDom(['world-datapack-select', 'world-datapack-hint']);
  const ui = bind(dom);
  const select = dom.getElementById('world-datapack-select');

  select.value = 'frozen_frontier';
  await select.fire('change');
  assert.equal(ui.selectedDataPackPreset, 'frozen_frontier');

  select.value = '';
  await select.fire('change');
  assert.equal(ui.selectedDataPackPreset, null, 'vanilla is the absence of a pack, not a pack called empty');
});

test('binding twice does not duplicate the options', () => {
  // `bindDataPackPresetSelect` is called on every setup; a second call must not double the menu.
  const dom = makeDom(['world-datapack-select', 'world-datapack-hint']);
  const ui = bind(dom);
  const count = dom.getElementById('world-datapack-select').options.length;
  globalThis.document = dom;
  try { UIManager.prototype.bindDataPackPresetSelect.call(ui); } finally { globalThis.document = undefined; }
  assert.equal(dom.getElementById('world-datapack-select').options.length, count);
});

test('a missing dropdown is not a crash', () => {
  // The panel has to survive a document without the markup, which is what every UI test uses.
  const dom = makeDom([]);
  const ui = { worldDataPackSelect: null, worldDataPackHint: null, game: {}, selectedDataPackPreset: null };
  const doc = globalThis.document;
  globalThis.document = dom;
  try {
    assert.doesNotThrow(() => UIManager.prototype.bindDataPackPresetSelect.call(ui));
  } finally { globalThis.document = doc; }
});

// --- wiring through world creation ---------------------------------------------------------------------

test('the choice is passed to applyWorldSettings when the world is created', () => {
  // The line that makes the dropdown mean anything. Read from the source, because the handler is deep inside
  // a modal callback that needs a whole game to reach.
  const ui = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  assert.match(ui, /dataPackPreset: this\.selectedDataPackPreset \?\? null/);
  // And it is in the SAME call that sets the seed and the biome, which runs before the reseed.
  const call = ui.slice(ui.indexOf('dataPackPreset: this.selectedDataPackPreset'));
  const before = ui.slice(Math.max(0, ui.indexOf('dataPackPreset: this.selectedDataPackPreset') - 900),
    ui.indexOf('dataPackPreset: this.selectedDataPackPreset'));
  assert.match(before, /applyWorldSettings/, 'inside applyWorldSettings');
  assert.match(before, /seed: seedNum/, 'alongside the seed');
  assert.match(before, /biome: biomeId/, 'and the biome');
  assert.ok(call.length > 0);
});

test('the game installs a preset, and changing it REPLACES rather than stacks', () => {
  const store = createPackStore();
  addPack(store, { name: 'Vanilla 1.21.4', files: { 'a.json': '{}' }, source: PACK_SOURCES.BUNDLED });
  // The same body as `Game.installDataPackPreset`, so the store-level behaviour is asserted directly.
  const install = (id) => {
    for (const p of allPacks(store)) if (p.source === PACK_SOURCES.PRESET) { store.packs.delete(p.name); store.order.splice(store.order.indexOf(p.name), 1); }
    if (!id) return { ok: true };
    const built = buildPresetPack(id);
    if (!built) return { ok: false, reason: 'unknown' };
    return addPack(store, { name: built.name, files: built.files, source: PACK_SOURCES.PRESET, format: 61 });
  };

  assert.equal(install('lush_havens').ok, true);
  assert.deepEqual(allPacks(store).map(p => p.name), ['Vanilla 1.21.4', 'Lush Havens'],
    'the preset goes LAST, so it wins over vanilla');
  assert.equal(install('frozen_frontier').ok, true);
  assert.deepEqual(allPacks(store).map(p => p.name), ['Vanilla 1.21.4', 'Frozen Frontier'],
    'two presets, not three packs');
  assert.equal(allPacks(store).some(p => p.source === PACK_SOURCES.BUNDLED), true, 'vanilla is untouched');
  assert.equal(install('not_a_preset').ok, false);
  assert.equal(install(null).ok, true);
  assert.deepEqual(allPacks(store).map(p => p.name), ['Vanilla 1.21.4'], 'and vanilla survives clearing');
});

test('the game has an installer and calls it when the setting changes', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /installDataPackPreset\(id\) \{/, 'there is a method');
  assert.match(main, /this\.installDataPackPreset\(this\.settings\.dataPackPreset\)/,
    'and applyWorldSettings drives it');
  // Only when the preset actually changed, so an unrelated settings change does not churn the store.
  assert.match(main, /hasOwnProperty\.call\(raw, 'dataPackPreset'\)/);
  assert.match(main, /import \{ buildPresetPack \} from '\.\/dataPackPresets\.js'/);
});

// --- the preset must WIN when the vanilla pack is underneath -------------------------------------------

/** The bundled pack, as the game installs it, plus a chosen preset -- the real store the game applies. */
function stackedStore(presetId) {
  const store = createPackStore();
  addPack(store, {
    name: 'Vanilla 1.21.4',
    files: JSON.parse(readFileSync(new URL('../public/datapacks/vanilla-1.21.4.json', import.meta.url), 'utf8')),
    source: PACK_SOURCES.BUNDLED,
    format: 61,
  });
  const built = buildPresetPack(presetId);
  addPack(store, { name: built.name, files: built.files, source: PACK_SOURCES.PRESET, format: 61 });
  return store;
}

test('the preset overrides vanilla, rather than being overridden by it', () => {
  // The order in the store is what decides this: `applyStore` applies in order and a later pack wins. Without
  // it the preset would be laid down first and vanilla would paint over it.
  const baseline = BIOMES.plains.surfaceBlock;
  const store = stackedStore('frozen_frontier');
  const result = applyStore(store);
  try {
    assert.deepEqual(result.failed, [], 'both packs applied');
    assert.equal(BIOMES.plains.surfaceBlock, BLOCKS.SNOW, 'the preset surface won');
    assert.notEqual(BIOMES.plains.surfaceBlock, baseline);
  } finally {
    revertAll(result);
    resetTagRegistry();
  }
  assert.equal(BIOMES.plains.surfaceBlock, baseline, 'and reverting restores the built-in value');
});

test('structure sets PRECEDE by pack instead of merging with vanilla\'s', () => {
  // Merging gave every preset vanilla's thirty-odd structures plus its own, so "Dungeon Rush" and
  // "Lush Havens" enabled the same set and the structure half of a preset meant nothing.
  const withVanillaAlone = (() => {
    const store = createPackStore();
    addPack(store, {
      name: 'Vanilla 1.21.4',
      files: JSON.parse(readFileSync(new URL('../public/datapacks/vanilla-1.21.4.json', import.meta.url), 'utf8')),
      source: PACK_SOURCES.BUNDLED, format: 61,
    });
    const result = applyStore(store);
    const ids = enabledStructureIds();
    revertAll(result);
    resetTagRegistry();
    return ids;
  })();
  assert.ok(withVanillaAlone.length > 10, `vanilla alone enables many, got ${withVanillaAlone.length}`);

  // A preset with a SMALL set must end up with exactly that set, not vanilla's plus it.
  const store = stackedStore('frozen_frontier');
  const result = applyStore(store);
  try {
    const ids = enabledStructureIds();
    const presetSet = getGenerationPreset('frozen_frontier').structures;
    assert.deepEqual([...ids].sort(), [...presetSet].sort(),
      `the preset's own three, not vanilla's ${withVanillaAlone.length}`);
    assert.ok(ids.length < withVanillaAlone.length, 'and emphatically not the union');
  } finally {
    revertAll(result);
    resetTagRegistry();
  }
});

test('a preset that wants no structures still gets none with vanilla underneath', () => {
  // The precedence has to span BOTH registries: Beast Wilds contributes a structure SET and no structure
  // entries, so reading only the entries let vanilla's thirty-odd keep winning over a preset that had
  // explicitly asked for none.
  const store = stackedStore('beast_wilds');
  const result = applyStore(store);
  try {
    assert.deepEqual(result.failed, []);
    assert.deepEqual(enabledStructureIds(), [], 'none at all');
  } finally {
    revertAll(result);
    resetTagRegistry();
  }
  assert.deepEqual(enabledStructureIds(), [...WORLD_STRUCTURE_IDS], 'and the baked three come back');
});

test('the presets produce SEVERAL distinct structure sets, with vanilla underneath', () => {
  // Deliberately not "all ten differ": `wild_highlands` and `lush_havens` share the populated set, and that
  // is fine -- they are distinct on terrain and on mobs, which is what their names are about. What would be a
  // failure is every preset collapsing onto vanilla's set, which is what merging produced.
  const byKey = new Map();
  for (const preset of GENERATION_PRESETS) {
    const store = stackedStore(preset.id);
    const result = applyStore(store);
    const key = enabledStructureIds().join(',');
    revertAll(result);
    resetTagRegistry();
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(preset.id);
  }
  assert.ok(byKey.size >= 5, `expected several distinct sets, got ${byKey.size}: `
    + JSON.stringify([...byKey.values()]));
  // The structure-themed presets must not collapse onto the same answer.
  const forPreset = (id) => [...byKey.entries()].find(([, ids]) => ids.includes(id))?.[0];
  assert.notEqual(forPreset('dungeon_rush'), forPreset('lush_havens'), 'dungeons and villages differ');
  assert.notEqual(forPreset('beast_wilds'), forPreset('lush_havens'), 'and none is none');
  assert.equal(forPreset('beast_wilds'), '', 'Beast Wilds is the empty set');
});

// --- the setting and its persistence -------------------------------------------------------------------

test('the setting is its own field, not overloaded onto the showcase preset', () => {
  // `preset` is the world TYPE (ordinary/showcase). Overloading it would make "showcase" and "Lush Havens"
  // mutually exclusive for no reason.
  assert.equal(DEFAULT_SETTINGS.dataPackPreset, null);
  const s = normaliseSettings({ preset: 'showcase', dataPackPreset: 'lush_havens' });
  assert.equal(s.preset, 'showcase');
  assert.equal(s.dataPackPreset, 'lush_havens', 'both survive together');
});

test('normaliseSettings keeps a usable id and drops anything else', () => {
  assert.equal(normaliseSettings({ dataPackPreset: 'lush_havens' }).dataPackPreset, 'lush_havens');
  assert.equal(normaliseSettings({ dataPackPreset: '' }).dataPackPreset, null);
  assert.equal(normaliseSettings({ dataPackPreset: 42 }).dataPackPreset, null);
  assert.equal(normaliseSettings({}).dataPackPreset, null);
  // An unknown id is KEPT as a string: validation belongs at the point of use, and buildPresetPack returns
  // null for it rather than throwing, so a stale id in an old save does nothing.
  assert.equal(normaliseSettings({ dataPackPreset: 'from_a_future_version' }).dataPackPreset,
    'from_a_future_version');
  assert.equal(buildPresetPack('from_a_future_version'), null, 'and building it is a no-op');
});

test('the chosen pack survives a save and a load', () => {
  const store = createPackStore();
  const built = buildPresetPack('dungeon_rush');
  addPack(store, { name: built.name, files: built.files, source: PACK_SOURCES.PRESET, format: 61 });
  const game = {
    dataPacks: store,
    difficulty: 'normal',
    player: {},
    settings: { gameMode: 'survival', difficulty: 'normal', cheats: false, preset: 'ordinary',
      dataPackPreset: 'dungeon_rush' },
  };
  const session = captureSessionState(game);
  assert.equal(session.settings.dataPackPreset, 'dungeon_rush', 'the id is in the settings');
  assert.deepEqual(session.dataPacks.packs.map(p => p.source), ['preset'], 'and the pack is in the save');

  const target = { player: {} };
  applySessionState(target, session);
  assert.equal(target.settings.dataPackPreset, 'dungeon_rush', 'restored');
  assert.deepEqual(allPacks(target.dataPacks).map(p => p.name), ['Dungeon Rush'],
    'and so is the pack itself, so the world loads with the content it was built from');
  assert.deepEqual(target.dataPackRestoreReport.errors, []);
});

test('a save with no pack choice restores cleanly', () => {
  // Every save written before this feature has no `dataPackPreset` key at all.
  const target = { player: {} };
  applySessionState(target, { difficulty: 'normal', settings: { gameMode: 'survival' } });
  // `applySessionState` MERGES the saved settings over the live ones, so an absent key stays absent rather
  // than being written as null. Both mean "no pack", and the menu reads it as `?? null`.
  assert.ok(target.settings.dataPackPreset == null, 'no pack choice, however that is spelled');
  assert.equal(allPacks(target.dataPacks).length, 0);
  assert.equal(SAVE_VERSION, 3, 'no version bump: the field is additive and absence means null');
});

test('the menu can show the preset a save was built with', () => {
  const dom = makeDom(['world-datapack-select', 'world-datapack-hint']);
  const ui = bind(dom, { settings: { dataPackPreset: 'beast_wilds' } });
  assert.ok(typeof ui.refreshDataPackPresetSelect === 'function', 'there is a refresh');
  ui.refreshDataPackPresetSelect();
  assert.equal(dom.getElementById('world-datapack-select').value, 'beast_wilds');
  assert.match(dom.getElementById('world-datapack-hint').textContent, /Nights come armed/);
});
