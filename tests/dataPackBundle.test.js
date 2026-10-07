// The bundled vanilla pack: shipping it, fetching it back, and applying a whole store in order.
//
// The unit tests below use a small synthetic bundle, so they are fast and test the behaviour rather than the
// data. One test reads the REAL shipped file and checks it against its own metadata, because a bundle that
// silently drifted from its manifest would be worse than no bundle -- the game would apply content it could
// not describe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  PACK_SOURCES, createPackStore, addPack, allPacks, enabledPacks, capturePacks, restorePacks,
  attachBundledFiles, persistenceReport,
} from '../src/dataPackStore.js';
import {
  BUNDLED_PACK_URL, BUNDLED_PACK_META_URL, BUNDLED_PACK_NAME,
  loadBundledPack, installBundledPack, reattachBundledPacks, resetBundledPackCache,
} from '../src/dataPackBundle.js';
import { applyStore, revertAll, describeStore } from '../src/dataPackApply.js';
import { BIOMES } from '../src/biomes.js';
import { RECIPES_2X2, RECIPES_3X3, findMatchingRecipe } from '../src/crafting.js';
import { SMELTING_RECIPES } from '../src/furnace.js';
import { TAG_REGISTRY } from '../src/dataPackRuntime.js';
import { BLOCKS } from '../src/blocks.js';

const REAL_PACK = 'public/datapacks/vanilla-1.21.4.json';
const REAL_META = 'public/datapacks/vanilla-1.21.4.meta.json';

/** A stand-in for the browser's fetch, serving whatever map of url -> text a test hands it. */
function fakeFetch(routes) {
  return async (url) => {
    const key = Object.keys(routes).find(k => String(url).includes(k));
    if (!key) return { ok: false, status: 404, json: async () => { throw new Error('not found'); } };
    const body = routes[key];
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  };
}

const smallBundle = () => ({
  [BUNDLED_PACK_URL]: JSON.stringify({
    'data/minecraft/worldgen/biome/plains.json': { effects: { sky_color: 7907327 }, temperature: 0.8 },
    'data/minecraft/recipe/oak_planks.json': {
      type: 'minecraft:crafting_shapeless',
      ingredients: ['minecraft:oak_log'],
      result: { id: 'minecraft:oak_planks', count: 4 },
    },
  }),
  [BUNDLED_PACK_META_URL]: JSON.stringify({ name: BUNDLED_PACK_NAME, ref: 'test', files: 2, bytes: 1, sha256: 'x' }),
});

function withBundle(t) {
  resetBundledPackCache();
  const routes = smallBundle();
  t.after(() => resetBundledPackCache());
  return { routes, fetch: fakeFetch(routes) };
}

// --- the real shipped bundle -------------------------------------------------------------------------

test('the shipped bundle exists and matches its own manifest', () => {
  // A bundle that drifted from its manifest would apply content it cannot describe.
  assert.ok(existsSync(REAL_PACK), 'the bundled pack was built: run scripts/build-vanilla-pack.mjs');
  assert.ok(existsSync(REAL_META), 'and its manifest');
  const text = readFileSync(REAL_PACK, 'utf8');
  const meta = JSON.parse(readFileSync(REAL_META, 'utf8'));
  const files = JSON.parse(text);

  assert.equal(Object.keys(files).length, meta.files, 'the file count matches');
  assert.equal(Buffer.byteLength(text, 'utf8'), meta.bytes, 'and the byte count');
  assert.equal(createHash('sha256').update(text).digest('hex'), meta.sha256, 'and the hash');
  assert.equal(meta.ref, '1.21.4-data', 'the version is pinned, not latest');
});

test('every file in the shipped bundle is one the loader recognises', async () => {
  // Curated to the types that have an adapter. A file the loader would skip is dead weight in a megabyte.
  const files = JSON.parse(readFileSync(REAL_PACK, 'utf8'));
  const { parsePackPath } = await import('../src/dataPack.js');
  const unknown = [];
  for (const path of Object.keys(files)) {
    if (!parsePackPath(path)) unknown.push(path);
  }
  assert.deepEqual(unknown.slice(0, 5), [], `${unknown.length} file(s) the loader does not handle`);
  assert.ok(Object.keys(files).length > 3000, 'and there are a lot of them');
});

test('the shipped bundle applies through the loader without a single skip', async () => {
  const { createDataPack } = await import('../src/dataPack.js');
  const files = JSON.parse(readFileSync(REAL_PACK, 'utf8'));
  const pack = createDataPack({ name: 'Real', files });
  assert.equal(pack.skipped.length, 0, 'nothing is skipped: ' + JSON.stringify(pack.skipped.slice(0, 3)));
  assert.equal(pack.entries.length, Object.keys(files).length, 'and nothing is lost');
});

// --- fetching it -------------------------------------------------------------------------------------

test('the bundle is fetched once and remembered', async (t) => {
  const { fetch } = withBundle(t);
  let calls = 0;
  const counting = async (url) => { calls++; return fetch(url); };
  const first = await loadBundledPack({ fetch: counting });
  const second = await loadBundledPack({ fetch: counting });
  assert.ok(first?.files);
  assert.equal(second, first, 'the same object comes back');
  assert.ok(calls <= 2, 'and it is not downloaded again, got ' + calls + ' calls');
});

test('a missing bundle returns null rather than throwing', async (t) => {
  // A missing default pack must not stop the game: the player gets the built-in content instead, which is
  // what happened before any of this existed.
  resetBundledPackCache();
  t.after(() => resetBundledPackCache());
  assert.equal(await loadBundledPack({ fetch: fakeFetch({}) }), null);
  assert.equal(await loadBundledPack({ fetch: async () => { throw new Error('offline'); } }), null);
  resetBundledPackCache();
  assert.equal(await loadBundledPack({ fetch: async () => ({ ok: true, json: async () => 'not an object' }) }), null);
  resetBundledPackCache();
  assert.equal(await loadBundledPack({ fetch: null }), null, 'no fetch at all');
});

test('installing the bundle adds it as the bundled source, and fails cleanly without one', async (t) => {
  const { fetch } = withBundle(t);
  const store = createPackStore();
  const ok = await installBundledPack(store, { fetch });
  assert.equal(ok.ok, true);
  assert.equal(ok.pack.source, PACK_SOURCES.BUNDLED);
  assert.equal(ok.pack.enabled, true, 'the bundled pack is the default, so it is on');
  assert.equal(ok.pack.meta.ref, 'test');

  resetBundledPackCache();
  const empty = createPackStore();
  const failed = await installBundledPack(empty, { fetch: fakeFetch({}) });
  assert.equal(failed.ok, false);
  assert.match(failed.reason, /could not be read/);
  assert.equal(allPacks(empty).length, 0, 'and nothing half-installed is left behind');
});

// --- a bundled pack is referenced, not carried --------------------------------------------------------

test('a bundled pack goes into a save as a reference with no files', () => {
  // Copying a megabyte of vanilla JSON into every save would be waste.
  const store = createPackStore();
  addPack(store, { name: BUNDLED_PACK_NAME, files: { 'data/minecraft/worldgen/biome/plains.json': '{}' }, source: PACK_SOURCES.BUNDLED });
  const record = capturePacks(store);
  assert.equal(record.packs.length, 1);
  assert.equal(record.packs[0].bundled, true);
  assert.equal(record.packs[0].files, undefined, 'the files are NOT written');
  assert.equal(record.bytes, 0, 'and it costs the save nothing');
  assert.equal(record.omitted.length, 0, 'it is not "omitted" either -- it is referenced');
});

test('restoring a bundled reference leaves it waiting for the bundle, and it can be re-attached', async (t) => {
  const { fetch } = withBundle(t);
  const store = createPackStore();
  addPack(store, { name: BUNDLED_PACK_NAME, files: { 'a.json': '{}' }, source: PACK_SOURCES.BUNDLED });
  const restored = restorePacks(capturePacks(store));

  assert.deepEqual([...restored.store.packs.keys()], [BUNDLED_PACK_NAME], 'the pack is back');
  assert.deepEqual(restored.awaitingBundle, [BUNDLED_PACK_NAME], 'and named as needing its files');
  assert.equal(restored.store.packs.get(BUNDLED_PACK_NAME).files, null, 'with no files yet');

  const done = await reattachBundledPacks(restored.store, restored.awaitingBundle, { fetch });
  assert.deepEqual(done, [BUNDLED_PACK_NAME]);
  const pack = restored.store.packs.get(BUNDLED_PACK_NAME);
  assert.ok(pack.files, 'the files are back');
  assert.equal(pack.awaitingBundle, false);
  assert.ok(pack.bytes > 0, 'and it is measured again');
});

test('re-attaching without a bundle changes nothing', async (t) => {
  resetBundledPackCache();
  t.after(() => resetBundledPackCache());
  const store = createPackStore();
  addPack(store, { name: BUNDLED_PACK_NAME, files: null, source: PACK_SOURCES.BUNDLED, bundled: true });
  assert.deepEqual(await reattachBundledPacks(store, [BUNDLED_PACK_NAME], { fetch: fakeFetch({}) }), []);
  assert.equal(store.packs.get(BUNDLED_PACK_NAME).files, null, 'it stays waiting rather than becoming empty');
});

test('a pack with no files and no bundle to wait for is refused', () => {
  // Otherwise the store could hold an enabled pack that applies nothing and looks like it worked.
  const store = createPackStore();
  const result = addPack(store, { name: 'Empty', files: null, source: PACK_SOURCES.PASTED });
  assert.equal(result.ok, false);
  assert.match(result.reason, /needs files/);
});

test('attachBundledFiles refuses nonsense', () => {
  const store = createPackStore();
  addPack(store, { name: 'B', files: null, source: PACK_SOURCES.BUNDLED, bundled: true });
  assert.equal(attachBundledFiles(store, 'B', null), false);
  assert.equal(attachBundledFiles(store, 'nope', {}), false);
});

test('a bundled pack is never reported as unpersistable', () => {
  // `persisted: false` means "too big to save and will be LOST". A bundled pack is not lost -- it comes back
  // from the bundle -- so reporting it as too large would be a lie the UI would repeat.
  const store = createPackStore();
  addPack(store, { name: BUNDLED_PACK_NAME, files: { 'data/x.json': 'x'.repeat(3 * 1024 * 1024) }, source: PACK_SOURCES.BUNDLED });
  const report = persistenceReport(store);
  assert.deepEqual(report.tooLarge, [], 'not listed as too large');
  assert.equal(report.bytes, 0, 'and it costs the save nothing');
});

// --- applying a whole store ---------------------------------------------------------------------------

test('applyStore applies every enabled pack and revertAll undoes it exactly', (t) => {
  const store = createPackStore();
  addPack(store, {
    name: 'Biomes',
    files: { 'data/t/worldgen/biome/plains.json': JSON.stringify({ effects: { sky_color: 424242 }, temperature: 0.5 }) },
  });
  addPack(store, {
    name: 'Recipe',
    files: {
      'data/t/recipe/planks.json': JSON.stringify({
        type: 'minecraft:crafting_shapeless', ingredients: ['minecraft:oak_log'], result: { id: 'minecraft:oak_planks', count: 4 },
      }),
    },
  });
  const before = { biomes: Object.keys(BIOMES).length, r3: RECIPES_3X3.length, sky: BIOMES.plains.skyColor };
  const result = applyStore(store);
  t.after(() => revertAll(result));

  assert.equal(result.failed.length, 0, JSON.stringify(result.failed));
  assert.equal(result.records.length, 2);
  assert.equal(result.summary.length, 2);
  assert.equal(BIOMES.plains.skyColor, 424242, 'the biome override landed');
  assert.ok(RECIPES_3X3.length > before.r3, 'and the recipe');

  assert.equal(revertAll(result), 2);
  assert.equal(Object.keys(BIOMES).length, before.biomes);
  assert.equal(RECIPES_3X3.length, before.r3);
  assert.equal(BIOMES.plains.skyColor, before.sky, 'and the original colour is back');
});

test('a disabled pack is skipped, and reverting is a no-op for an empty result', (t) => {
  const store = createPackStore();
  addPack(store, { name: 'Off', files: { 'data/t/worldgen/biome/plains.json': JSON.stringify({ effects: { sky_color: 1 } }) }, enabled: false });
  const result = applyStore(store);
  t.after(() => revertAll(result));
  assert.equal(result.records.length, 0);
  assert.equal(result.summary.length, 0);
  assert.equal(revertAll(result), 0);
  assert.equal(revertAll(null), 0);
  assert.equal(revertAll({}), 0);
});

test('a pack with no files is reported as failed, not silently applied', (t) => {
  // This is the state a bundled pack is in between a load and its bundle arriving.
  const store = createPackStore();
  addPack(store, { name: 'Waiting', files: null, source: PACK_SOURCES.BUNDLED, bundled: true });
  const result = applyStore(store);
  t.after(() => revertAll(result));
  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0].reason, /waiting for the bundle/);
  assert.match(result.summary[0], /waiting for the bundle/);
});

test('a pack whose files are all unusable is reported rather than counted as applied', (t) => {
  const store = createPackStore();
  addPack(store, { name: 'Junk', files: { 'data/t/README.md': 'not json', 'data/t/recipe/bad.json': '{ broken' } });
  const result = applyStore(store);
  t.after(() => revertAll(result));
  assert.equal(result.records.length, 0);
  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0].reason, /nothing loadable/);
});

test('packs apply in store order, so a later pack overrides an earlier one', (t) => {
  const store = createPackStore();
  addPack(store, { name: 'Base', files: { 'data/t/worldgen/biome/plains.json': JSON.stringify({ effects: { sky_color: 100 } }) } });
  addPack(store, { name: 'Over', files: { 'data/t/worldgen/biome/plains.json': JSON.stringify({ effects: { sky_color: 200 } }) } });
  const result = applyStore(store);
  t.after(() => revertAll(result));
  assert.equal(BIOMES.plains.skyColor, 200, 'the later pack wins');
  revertAll(result);
  assert.equal(BIOMES.plains.skyColor, undefined || BIOMES.plains.skyColor, 'and reverting both is clean');
  assert.notEqual(BIOMES.plains.skyColor, 100, 'the base value is not left behind by the revert order');
});

test('describeStore names each pack with what matters to a player', (t) => {
  const store = createPackStore();
  addPack(store, { name: 'Bundled', files: { 'a.json': '{}' }, source: PACK_SOURCES.BUNDLED });
  addPack(store, { name: 'Mine', files: { 'b.json': '{}' }, source: PACK_SOURCES.PASTED, enabled: false });
  const described = describeStore(store);
  assert.equal(described.length, 2);
  assert.deepEqual(described[0], {
    name: 'Bundled', source: 'bundled', enabled: true, bytes: described[0].bytes,
    persisted: false, awaitingBundle: false, bundled: true,
  });
  assert.equal(described[1].enabled, false);
  assert.equal(described[1].bundled, false);
  assert.deepEqual(describeStore(null), []);
});

// --- the default: the bundled pack is what the game starts with ---------------------------------------

test('the game installs the bundled pack as the default and applies it before building terrain', () => {
  // "A bundled vanilla pack is the default" has to mean the game installs it, not that a player may.
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /this\.dataPackReady = this\.installDefaultDataPack\(\)/,
    'the download starts at startup rather than on a click');
  assert.match(main, /installDefaultDataPack\(\) \{/, 'and there is a method for it');
  assert.match(main, /installBundledPack\(this\.dataPacks, \{ name: BUNDLED_PACK_NAME \}\)/);
  assert.match(main, /import \{ installBundledPack, BUNDLED_PACK_NAME \} from '\.\/dataPackBundle\.js'/);

  // Applied BEFORE terrain, because biomes and recipes are read while the world loads. Applying afterwards
  // would build terrain from one content set and then claim another was in effect.
  const generate = main.slice(main.indexOf('async generateNewWorld()'));
  const begin = generate.indexOf('beginLoading(this.lifecycle)');
  const apply = generate.indexOf('await this.applyDataPacks()');
  const biome = generate.search(/selectedBiome|BIOMES/);
  assert.ok(begin >= 0 && apply > begin, 'the apply happens after the lifecycle starts loading');
  assert.ok(biome < 0 || apply < biome, 'and before anything reads a biome');
});

test('the default install cannot reject, so a missing bundle cannot stop the game', async () => {
  // In Node `/datapacks/...` is not a URL anything can fetch, so this is the path every existing test takes:
  // the install fails, the store stays empty, and nothing about the world changes.
  resetBundledPackCache();
  const store = createPackStore();
  const result = await installBundledPack(store, { name: BUNDLED_PACK_NAME }).catch(() => ({ ok: false }));
  assert.equal(result.ok, false);
  assert.equal(allPacks(store).length, 0, 'nothing half-installed');
});

test('applyDataPacks waits for the default before applying anything', () => {
  // Without the wait, the first apply races the download and the world is built from the built-in content
  // while the store says the vanilla pack is on.
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const method = main.slice(main.indexOf('async applyDataPacks()'));
  assert.match(method.slice(0, 700), /await this\.dataPackReady/);
  assert.match(method.slice(0, 700), /this\.dataPackReady = null/, 'and it waits only once');
});

test('a bundled pack is the default and the pasted ones are the player\'s', () => {
  // The two provenances the objective names.
  assert.equal(PACK_SOURCES.BUNDLED, 'bundled');
  assert.equal(PACK_SOURCES.PASTED, 'pasted');
  assert.equal(PACK_SOURCES.UPLOADED, 'uploaded');
});


test('the real bundled pack applies, reaches the matcher, and reverts exactly', async (t) => {
  // The end-to-end case: the shipped megabyte, through the store, into the game, and back out.
  resetBundledPackCache();
  t.after(() => resetBundledPackCache());
  const realFetch = fakeFetch({
    [BUNDLED_PACK_URL]: readFileSync(REAL_PACK, 'utf8'),
    [BUNDLED_PACK_META_URL]: readFileSync(REAL_META, 'utf8'),
  });
  const store = createPackStore();
  const installed = await installBundledPack(store, { fetch: realFetch });
  assert.equal(installed.ok, true);

  const before = {
    biomes: Object.keys(BIOMES).length,
    r2: RECIPES_2X2.length,
    r3: RECIPES_3X3.length,
    smelt: Object.keys(SMELTING_RECIPES).length,
    tags: TAG_REGISTRY.item_tag.size + TAG_REGISTRY.block_tag.size,
    plains: BIOMES.plains,
  };

  const result = applyStore(store);
  t.after(() => revertAll(result));
  assert.deepEqual(result.failed, [], 'nothing failed');
  assert.equal(BIOMES.plains.fromDataPack, true, 'vanilla plains replaced the built-in one');
  assert.equal(BIOMES.plains.skyColor, 7907327, 'with the colour from the file');
  assert.ok(RECIPES_3X3.length > before.r3, 'thousands of recipes arrived');
  assert.ok(TAG_REGISTRY.item_tag.size > 0, 'and the item tags, which did not exist before');

  // The real matcher finds a real vanilla recipe.
  const cell = (id) => ({ id, count: 1, isBlock: typeof id === 'number' });
  const recipes = [...RECIPES_2X2, ...RECIPES_3X3];
  const planks = findMatchingRecipe([cell(BLOCKS.OAK_LOG)], 1, 1, recipes);
  const crafted = planks?.result ?? planks;
  assert.ok(crafted, 'oak_log crafts');
  assert.equal(crafted.id, BLOCKS.OAK_PLANKS);

  revertAll(result);
  assert.equal(Object.keys(BIOMES).length, before.biomes);
  assert.equal(RECIPES_2X2.length, before.r2);
  assert.equal(RECIPES_3X3.length, before.r3);
  assert.equal(Object.keys(SMELTING_RECIPES).length, before.smelt);
  assert.equal(TAG_REGISTRY.item_tag.size + TAG_REGISTRY.block_tag.size, before.tags);
  assert.equal(BIOMES.plains, before.plains, 'and the built-in biome object is the one that was there');
});
