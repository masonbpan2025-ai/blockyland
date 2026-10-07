// Keeping loaded packs, and keeping them across a reload.
//
// A pack that applies correctly and then vanishes on reload is worse than one that never loaded: the player
// has no way to tell whether their content is gone or just off. These cover the store, the size caps, the
// save round trip and the two shapes of pasted text.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PACK_SOURCES, MAX_PERSISTED_PACK_BYTES, MAX_SAVE_PACK_BYTES, packByteSize,
  createPackStore, addPack, removePack, setPackEnabled, enabledPacks, allPacks, storeByteSize,
  persistenceReport, capturePacks, restorePacks, filesFromText,
} from '../src/dataPackStore.js';
import { SAVE_VERSION, captureSessionState, applySessionState, migrateSave } from '../src/saveSchema.js';

const biomeFiles = (sky = 1) => ({ 'data/t/worldgen/biome/a.json': JSON.stringify({ effects: { sky_color: sky } }) });

// --- the store ---------------------------------------------------------------------------------------

test('a pack round-trips through the store', () => {
  const store = createPackStore();
  const result = addPack(store, { name: 'Mine', files: biomeFiles(), source: PACK_SOURCES.PASTED, format: 48 });
  assert.equal(result.ok, true);
  assert.equal(result.pack.enabled, true, 'a pack is on when it is added');
  assert.equal(result.pack.format, 48);
  assert.deepEqual([...store.packs.keys()], ['Mine']);
});

test('a pack needs a name and files', () => {
  const store = createPackStore();
  assert.equal(addPack(store, { files: biomeFiles() }).ok, false);
  assert.equal(addPack(store, { name: '   ', files: biomeFiles() }).ok, false);
  assert.equal(addPack(store, { name: 'x' }).ok, false);
  assert.equal(addPack(null, { name: 'x', files: {} }).ok, false, 'not a store');
  assert.equal(allPacks(store).length, 0);
});

test('an unknown source falls back rather than being stored as-is', () => {
  const store = createPackStore();
  const { pack } = addPack(store, { name: 'x', files: biomeFiles(), source: 'from-mars' });
  assert.equal(pack.source, PACK_SOURCES.PASTED);
});

test('re-adding a name replaces the pack in place, keeping its position', () => {
  const store = createPackStore();
  addPack(store, { name: 'A', files: biomeFiles(1) });
  addPack(store, { name: 'B', files: biomeFiles(2) });
  addPack(store, { name: 'A', files: biomeFiles(3) });
  assert.deepEqual(store.order, ['A', 'B'], 'the order is stable, because load order is priority');
  assert.equal(store.packs.get('A').files['data/t/worldgen/biome/a.json'].includes('3'), true);
});

test('packs can be turned off and removed', () => {
  const store = createPackStore();
  addPack(store, { name: 'A', files: biomeFiles() });
  addPack(store, { name: 'B', files: biomeFiles() });
  assert.equal(setPackEnabled(store, 'A', false), true);
  assert.deepEqual(enabledPacks(store).map(p => p.name), ['B']);
  assert.equal(allPacks(store).length, 2, 'a disabled pack is still in the store');
  assert.equal(setPackEnabled(store, 'nope', false), false);

  assert.equal(removePack(store, 'B'), true);
  assert.deepEqual(store.order, ['A']);
  assert.equal(removePack(store, 'B'), false, 'removing twice is false, not an error');
});

test('the order packs are added is the order they apply', () => {
  // Load order is priority: a later pack overrides an earlier one by id.
  const store = createPackStore();
  addPack(store, { name: 'base', files: biomeFiles() });
  addPack(store, { name: 'over', files: biomeFiles() });
  assert.deepEqual(enabledPacks(store).map(p => p.name), ['base', 'over']);
});

// --- size, and what happens when a pack is too big to save ---------------------------------------------

test('a pack over the cap is kept for the session but marked unpersistable', () => {
  // Truncating silently and refusing outright are both worse than working now and saying so.
  const store = createPackStore();
  const huge = { 'data/t/worldgen/biome/a.json': 'x'.repeat(MAX_PERSISTED_PACK_BYTES + 10) };
  const { pack } = addPack(store, { name: 'Huge', files: huge });
  assert.equal(pack.persisted, false);
  assert.ok(pack.bytes > MAX_PERSISTED_PACK_BYTES);
  assert.equal(pack.enabled, true, 'and it still works this session');
  assert.deepEqual(persistenceReport(store).tooLarge, ['Huge']);
});

test('a pack too big to save is NAMED in the record rather than dropped', () => {
  const store = createPackStore();
  addPack(store, { name: 'Ok', files: biomeFiles() });
  addPack(store, { name: 'Huge', files: { 'data/t/x.json': 'x'.repeat(MAX_PERSISTED_PACK_BYTES + 10) } });
  const record = capturePacks(store);
  assert.deepEqual(record.packs.map(p => p.name), ['Ok']);
  assert.equal(record.omitted.length, 1);
  assert.equal(record.omitted[0].name, 'Huge');
  assert.match(record.omitted[0].reason, /too large/);
});

test('packByteSize survives something that cannot be serialised', () => {
  // A cyclic object cannot be persisted, and must not throw at save time.
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(packByteSize(cyclic), Infinity);
  assert.equal(packByteSize(null), 0);
  assert.ok(packByteSize({ a: 'b' }) > 0);
});

test('the total save budget is enforced across packs', () => {
  const store = createPackStore();
  // Each pack must be UNDER the per-pack cap, or it is marked unpersistable and never counts toward the save
  // total at all -- which is how this test first failed, with a total of 0.
  const chunk = Math.floor(MAX_PERSISTED_PACK_BYTES * 0.9);
  const count = Math.ceil(MAX_SAVE_PACK_BYTES / chunk) + 1;
  for (let i = 0; i < count; i++) {
    addPack(store, { name: `P${i}`, files: { 'data/t/x.json': 'x'.repeat(chunk) } });
  }
  assert.equal(allPacks(store).every(p => p.persisted), true, 'each one is individually persistable');
  assert.ok(storeByteSize(store) > MAX_SAVE_PACK_BYTES, 'but together they are over the budget');

  const record = capturePacks(store);
  assert.ok(record.packs.length < count, 'not everything fits');
  assert.ok(record.omitted.length >= 1, 'and what did not fit is named');
  assert.match(record.omitted[0].reason, /budget/);
  assert.ok(record.bytes <= MAX_SAVE_PACK_BYTES, 'the record stays inside the budget');
});

// --- the save round trip ------------------------------------------------------------------------------

test('packs survive a save and a load', () => {
  const store = createPackStore();
  addPack(store, { name: 'Biome Pack', files: biomeFiles(42), source: PACK_SOURCES.PASTED, format: 48 });
  addPack(store, { name: 'Off Pack', files: biomeFiles(1), enabled: false });

  const { store: back, errors } = restorePacks(capturePacks(store));
  assert.deepEqual(errors, []);
  assert.deepEqual([...back.packs.keys()], ['Biome Pack', 'Off Pack']);
  assert.equal(back.packs.get('Biome Pack').format, 48);
  assert.equal(back.packs.get('Biome Pack').source, PACK_SOURCES.PASTED);
  assert.equal(back.packs.get('Off Pack').enabled, false, 'a pack that was off comes back off');
  assert.deepEqual(enabledPacks(back).map(p => p.name), ['Biome Pack']);
  // The files themselves, not just the name -- otherwise the pack loads empty.
  assert.equal(back.packs.get('Biome Pack').files['data/t/worldgen/biome/a.json'].includes('42'), true);
});

test('a missing or malformed record restores an empty store, not a crash', () => {
  for (const bad of [null, undefined, 'nope', 42, [], {}]) {
    const { store, errors } = restorePacks(bad);
    assert.equal(allPacks(store).length, 0, JSON.stringify(bad));
    assert.deepEqual(errors, []);
  }
  const junk = restorePacks({ packs: [null, { name: 'ok', files: biomeFiles() }, { name: 'no files' }] });
  assert.deepEqual([...junk.store.packs.keys()], ['ok'], 'the usable one still loads');
  assert.equal(junk.errors.length, 2, 'and the two bad entries are reported');
});

test('a record written by an older build has no dataPacks and loads nothing', () => {
  // A v2 save has no `session.dataPacks` key at all.
  const { store, errors } = restorePacks(undefined);
  assert.equal(allPacks(store).length, 0);
  assert.deepEqual(errors, []);
});

// --- pasted text --------------------------------------------------------------------------------------

test('a whole data pack can be pasted as a path map', () => {
  const text = JSON.stringify({
    'data/x/recipe/a.json': { type: 'minecraft:crafting_shapeless', ingredients: ['minecraft:oak_planks'], result: { id: 'minecraft:stick', count: 1 } },
    'data/x/worldgen/biome/b.json': { effects: { sky_color: 1 } },
  });
  const { ok, files } = filesFromText(text);
  assert.equal(ok, true);
  assert.equal(Object.keys(files).length, 2);
  assert.ok(files['data/x/recipe/a.json'], 'values are stored as JSON text');
});

test('a single generated file needs a type and an id, and says so when it has none', () => {
  // This is the "I generated one biome on misode.github.io and want it in the game" case.
  const single = JSON.stringify({ effects: { sky_color: 7907327 }, temperature: 0.8 });
  const refused = filesFromText(single);
  assert.equal(refused.ok, false);
  assert.match(refused.errors[0], /needs a type/);

  const placed = filesFromText(single, { type: 'worldgen/biome', id: 'my_plains', namespace: 'me' });
  assert.equal(placed.ok, true);
  assert.deepEqual(Object.keys(placed.files), ['data/me/worldgen/biome/my_plains.json']);
  // And the path it invents really is a path the loader recognises.
  assert.ok(placed.files['data/me/worldgen/biome/my_plains.json']);
});

test('pasted text that is not JSON is refused with the reason', () => {
  const { ok, errors } = filesFromText('{ not json');
  assert.equal(ok, false);
  assert.match(errors[0], /invalid JSON/);
  assert.equal(filesFromText('').ok, false);
  assert.equal(filesFromText('   ').ok, false);
  assert.equal(filesFromText(null).ok, false);
});

test('a single file with no type is told apart from a whole pack', () => {
  // A pack is a path map; anything else is one generated file. Getting this backwards would silently load
  // one recipe as a pack of nothing.
  const pack = filesFromText(JSON.stringify({ 'pack.mcmeta': { pack: { pack_format: 48 } } }));
  assert.equal(pack.ok, true, 'pack.mcmeta alone marks a pack');
  assert.ok(pack.files['pack.mcmeta']);
  const one = filesFromText(JSON.stringify({ pools: [] }));
  assert.equal(one.ok, false, 'a loot table on its own is not a pack');
});

// --- the save schema ----------------------------------------------------------------------------------

test('the save version was bumped, and an older save still migrates', () => {
  assert.equal(SAVE_VERSION, 3, 'v3 adds session.dataPacks');
  const v2 = migrateSave({ version: 2, player: { health: 20 } });
  assert.equal(v2.version, 3);
  assert.equal(v2.migratedFrom, 2);
  assert.equal(v2.player.health, 20, 'and nothing is lost');
  // A save already at this version is untouched apart from the version field.
  const current = migrateSave({ version: 3, player: { health: 7 } });
  assert.equal(current.migratedFrom, undefined);
});

test('the session carries packs, and applying it puts them in the game', () => {
  const store = createPackStore();
  addPack(store, { name: 'Carried', files: biomeFiles(9) });
  const game = {
    dataPacks: store,
    difficulty: 'normal',
    settings: { gameMode: 'survival', difficulty: 'normal', cheats: false, preset: 'default' },
    player: {},
  };
  const session = captureSessionState(game);
  assert.ok(session.dataPacks, 'the session carries them');
  assert.equal(session.dataPacks.packs.length, 1);

  const target = { player: {} };
  applySessionState(target, session);
  assert.ok(target.dataPacks, 'and a load restores the store');
  assert.deepEqual([...target.dataPacks.packs.keys()], ['Carried']);
  assert.deepEqual(target.dataPackRestoreReport.errors, []);
});

test('a session with no packs restores an empty store rather than undefined', () => {
  // `game.dataPacks` being undefined is what every existing save produces, and the UI reads it.
  const target = { player: {} };
  applySessionState(target, { difficulty: 'normal' });
  assert.ok(target.dataPacks, 'a store exists even when the save had none');
  assert.equal(allPacks(target.dataPacks).length, 0);
});

test('a save that could not carry a pack reports which one', () => {
  const store = createPackStore();
  addPack(store, { name: 'Huge', files: { 'data/t/x.json': 'x'.repeat(MAX_PERSISTED_PACK_BYTES + 10) } });
  const session = captureSessionState({ dataPacks: store, settings: null, player: {} });
  const target = { player: {} };
  applySessionState(target, session);
  const report = target.dataPackRestoreReport;
  assert.equal(report.omitted.length, 1);
  assert.equal(report.omitted[0].name, 'Huge', 'the player can be told exactly what is missing');
});

test('captureSessionState tolerates a game with no pack store', () => {
  // Every existing game object has no `dataPacks` yet.
  const session = captureSessionState({ difficulty: 'normal' });
  assert.ok(session.dataPacks, 'it captures an empty record rather than null');
  assert.deepEqual(session.dataPacks.packs, []);
  assert.equal(captureSessionState(null), null);
});
