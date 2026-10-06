// What a save carries, and what loading one is allowed to do.
//
// The v1 format saved a player's position, look angles, mode, health, hunger, exp and level, plus a hotbar and
// storage. Everything else Survival keeps was dropped on save and invented on load:
//
//  - saturation and exhaustion were never saved;
//  - armour, the offhand and the cursor stack were not saved at all, so a full suit of armour and a shield
//    vanished on every reload;
//  - the bed binding was forgotten, so your respawn point reset;
//  - `hunger` defaulted to **20** when a field was absent, so an older save arrived well fed;
//  - `mapData.inventory.hotbar.map(...)` threw outright when the inventory was missing or not an array.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Inventory } from '../src/inventory.js';
import {
  SAVE_VERSION, LEGACY_DEFAULTS, HOTBAR_SLOTS, STORAGE_SLOTS,
  normaliseSlots, capturePlayerState, applyPlayerState,
  captureInventoryState, applyInventoryState,
  captureSessionState, applySessionState, migrateSave,
} from '../src/saveSchema.js';

const vec = (x, y, z) => ({ x, y, z });
const makeVec = { makeVector: vec };

/** A player with every Survival field set to something distinguishable from its default. */
function fullPlayer(over = {}) {
  return Object.assign({
    saturation: 3.5,
    exhaustion: 2.25,
    absorption: 4,
    air: 250,
    xp: 17,
    level: 5,
    health: 13,
    hunger: 9,
    statusEffects: new Map([['poison', { duration: 8, level: 2, tickTimer: 1.5 }]]),
    isDead: false,
    deathDropsDone: false,
    bedSpawnPosition: vec(4, 30, 9),
    bedDimension: 'overworld',
    spawnPosition: vec(1.5, 27, -1.5),
  }, over);
}

// --- the Survival fields v1 forgot -------------------------------------------------------------------

test('every Survival field survives a round trip', () => {
  const saved = capturePlayerState(fullPlayer());
  const target = { statusEffects: new Map() };
  applyPlayerState(target, saved, makeVec);

  assert.equal(target.saturation, 3.5);
  assert.equal(target.exhaustion, 2.25);
  assert.equal(target.absorption, 4);
  assert.equal(target.air, 250);
  assert.equal(target.xp, 17);
  assert.deepEqual(target.bedSpawnPosition, vec(4, 30, 9), 'the bed binding is not forgotten');
  assert.equal(target.bedDimension, 'overworld');
  assert.deepEqual(target.spawnPosition, vec(1.5, 27, -1.5), 'nor the world spawn');
  // Effects are a Map, which JSON cannot hold, so they travel as pairs.
  assert.deepEqual(target.statusEffects.get('poison'), { duration: 8, level: 2, tickTimer: 1.5 });
});

test('the saved effects are plain JSON', () => {
  // If a Map leaked into the save, `JSON.stringify` would write `{}` and the effects would silently vanish.
  const saved = capturePlayerState(fullPlayer());
  const round = JSON.parse(JSON.stringify(saved));
  assert.deepEqual(round.statusEffects, [['poison', { duration: 8, level: 2, tickTimer: 1.5 }]]);
  const target = { statusEffects: new Map() };
  applyPlayerState(target, round, makeVec);
  assert.equal(target.statusEffects.get('poison').duration, 8, 'and they survive the JSON trip');
});

test('a missing hunger or saturation does NOT arrive as a full bar', () => {
  // The specific bug: `game.player.hunger = p.hunger ?? 20`. A v1 save with no saturation field loaded at
  // whatever the constructor had set, and a save with no hunger field arrived well fed.
  const target = { statusEffects: new Map() };
  applyPlayerState(target, {}, makeVec);
  assert.equal(target.saturation, LEGACY_DEFAULTS.saturation, 'the documented default');
  assert.equal(target.saturation, 5, 'which is Java' + "'" + 's starting saturation');
  assert.equal(target.exhaustion, 0);
  // And the default must not be a full bar for a field that has no business being one.
  assert.notEqual(LEGACY_DEFAULTS.saturation, 20);
});

test('nonsense values take the documented default instead of reaching the game', () => {
  // NaN is the dangerous one: `Math.max(NaN, x)` is NaN and poisons every later comparison.
  const target = { statusEffects: new Map() };
  applyPlayerState(target, { saturation: NaN, exhaustion: 'lots', absorption: null, air: {}, xp: Infinity },
    makeVec);
  assert.equal(target.saturation, LEGACY_DEFAULTS.saturation);
  assert.equal(target.exhaustion, LEGACY_DEFAULTS.exhaustion);
  assert.equal(target.absorption, LEGACY_DEFAULTS.absorption);
  assert.notEqual(target.air, undefined, 'a nonsense air leaves the field alone rather than setting NaN');
  assert.equal(target.xp, LEGACY_DEFAULTS.exp);
});

// --- dead players ------------------------------------------------------------------------------------

test('a player who saves while dead loads dead, and does not drop twice', () => {
  // Restoring them alive would be a free resurrection, and it would let them die again and drop a SECOND
  // inventory on top of the one already on the ground.
  const saved = capturePlayerState(fullPlayer({ isDead: true, deathDropsDone: true, health: 0 }));
  const target = { statusEffects: new Map(), health: 20 };
  applyPlayerState(target, saved, makeVec);
  assert.equal(target.isDead, true);
  assert.equal(target.health, 0, 'and is not resurrected by the health field');
  assert.equal(target.deathDropsDone, true, 'the drop transaction stays spent');
});

test('a live player loads live with the drop transaction unspent', () => {
  const saved = capturePlayerState(fullPlayer({ isDead: false, deathDropsDone: false }));
  const target = { statusEffects: new Map(), health: 5 };
  applyPlayerState(target, saved, makeVec);
  assert.equal(target.isDead, false);
  assert.equal(target.deathDropsDone, false, 'so a later death still drops');
  assert.equal(target.health, 5, 'and the reset does not run on load');
});

// --- the inventory -----------------------------------------------------------------------------------

test('armour, the offhand and the cursor survive a round trip', () => {
  // None of these were saved at all in v1, so a full suit and a shield disappeared on every reload.
  const inv = new Inventory();
  inv.hotbar[0] = { id: 'stone', count: 64, isBlock: true };
  inv.storage[7] = { id: 'diamond', count: 2 };
  inv.armor = { head: { id: 'iron_helmet', count: 1 }, chest: { id: 'iron_chestplate', count: 1 },
    legs: null, feet: { id: 'iron_boots', count: 1 } };
  inv.offhand = { id: 'shield', count: 1 };
  inv.cursorItem = { id: 'torch', count: 12 };

  const saved = captureInventoryState(inv);
  const loaded = new Inventory();
  applyInventoryState(loaded, JSON.parse(JSON.stringify(saved)));

  assert.equal(loaded.hotbar[0].id, 'stone');
  assert.equal(loaded.hotbar[0].count, 64);
  assert.equal(loaded.armor.head.id, 'iron_helmet');
  assert.equal(loaded.armor.chest.id, 'iron_chestplate');
  assert.equal(loaded.armor.legs, null, 'an empty slot stays empty');
  assert.equal(loaded.armor.feet.id, 'iron_boots');
  assert.equal(loaded.offhand.id, 'shield');
  assert.equal(loaded.cursorItem.id, 'torch');
});

test('item metadata survives, not only the id and count', () => {
  // Durability and enchantments live on the stack, so a shallow id/count copy would lose both.
  const inv = new Inventory();
  inv.hotbar[1] = { id: 'diamond_pickaxe', count: 1, durability: 812, enchantments: { efficiency: 3 },
    customName: 'Digger' };
  const loaded = new Inventory();
  applyInventoryState(loaded, JSON.parse(JSON.stringify(captureInventoryState(inv))));
  assert.equal(loaded.hotbar[1].durability, 812);
  assert.deepEqual(loaded.hotbar[1].enchantments, { efficiency: 3 });
  assert.equal(loaded.hotbar[1].customName, 'Digger');
});

test('slot arrays are rebuilt to exactly nine and twenty-seven', () => {
  const loaded = new Inventory();
  applyInventoryState(loaded, { hotbar: [1, 2, 3], storage: new Array(40).fill({ id: 'x' }) });
  assert.equal(loaded.hotbar.length, HOTBAR_SLOTS);
  assert.equal(loaded.storage.length, STORAGE_SLOTS);
  // A non-object entry is not an item, so it becomes an empty slot rather than a bare number the hotbar
  // renderer would then try to read `.id` from.
  assert.deepEqual(loaded.hotbar, [null, null, null, null, null, null, null, null, null]);
  // The overflow is dropped: the array is exactly 27 long, so there is no index 39 at all. Checked with the
  // length and the last real index, because `strict` assert distinguishes `undefined` from `null`.
  assert.equal(loaded.storage.length, STORAGE_SLOTS);
  assert.equal(loaded.storage[STORAGE_SLOTS - 1].id, 'x', 'the last stored slot is the one that survived');
  assert.equal(loaded.storage[STORAGE_SLOTS], undefined, 'and past the end there is nothing');
  // A nonsense active slot is clamped rather than indexing off the end.
  applyInventoryState(loaded, { activeSlot: 99 });
  assert.equal(loaded.activeSlot, HOTBAR_SLOTS - 1);
  applyInventoryState(loaded, { activeSlot: -4 });
  assert.equal(loaded.activeSlot, 0);
  // And a real stack in the same array is kept.
  applyInventoryState(loaded, { hotbar: [null, { id: 'stone', count: 3 }] });
  assert.equal(loaded.hotbar[1].id, 'stone');
  assert.equal(loaded.hotbar[0], null);
});

test('loading REPLACES the session inventory rather than merging into it', () => {
  // The old `if (mapData.inventory)` guard skipped the whole block for a save with no inventory, leaving the
  // PREVIOUS world's gear in the hotbar. Loading must not leak one world's items into another.
  const inv = new Inventory();
  inv.hotbar[0] = { id: 'LEFTOVER', count: 1 };
  inv.storage[0] = { id: 'LEFTOVER', count: 1 };
  inv.armor.head = { id: 'LEFTOVER', count: 1 };
  inv.offhand = { id: 'LEFTOVER', count: 1 };

  applyInventoryState(inv, { hotbar: [{ id: 'stone', count: 1 }] });
  assert.equal(inv.hotbar[0].id, 'stone');
  assert.equal(inv.storage.filter(Boolean).length, 0, 'the previous storage is gone');
  assert.equal(inv.armor.head, null, 'nor does an old helmet survive');
  assert.equal(inv.offhand, null);
});

test('a save with no inventory loads EMPTY, not the demo kit', () => {
  // The plan is explicit: "missing inventory means empty, not demo gear."
  const inv = new Inventory();
  inv.giveDemoKit();
  assert.equal(inv.hotbar.filter(Boolean).length, 8, 'the control: the kit was there');
  applyInventoryState(inv, undefined);
  assert.equal(inv.hotbar.filter(Boolean).length, 0);
  assert.equal(inv.storage.filter(Boolean).length, 0);
});

test('a malformed inventory does not throw', () => {
  // `mapData.inventory.hotbar.map(...)` threw outright when hotbar was missing or not an array.
  for (const bad of [undefined, null, {}, { hotbar: 'nope' }, { hotbar: null, storage: 5 },
    { hotbar: [], armor: 'nope' }, 42]) {
    const inv = new Inventory();
    assert.doesNotThrow(() => applyInventoryState(inv, bad), 'for ' + JSON.stringify(bad));
    assert.equal(inv.hotbar.length, HOTBAR_SLOTS);
    assert.equal(inv.storage.length, STORAGE_SLOTS);
  }
  // And a helper that is handed nothing at all is a no-op rather than a crash.
  assert.equal(applyInventoryState(null, {}), null);
  assert.equal(captureInventoryState(null), null);
});

test('the crafting grid is cleared rather than restored', () => {
  // A grid is a workspace and its result is a preview, so neither is saved state.
  const inv = new Inventory();
  inv.craft3x3[0] = { id: 'stale', count: 1 };
  inv.craft3x3Result = { id: 'stale_result', count: 1 };
  applyInventoryState(inv, {});
  assert.equal(inv.craft3x3.filter(Boolean).length, 0);
  assert.equal(inv.craft3x3Result, null);
});

test('a saved demo kit is preserved, not mistaken for one to delete', () => {
  // The migration must not detect "a familiar kit" and confiscate it -- a designed world's gear is gear.
  const inv = new Inventory();
  inv.giveDemoKit();
  const loaded = new Inventory();
  applyInventoryState(loaded, JSON.parse(JSON.stringify(captureInventoryState(inv))));
  assert.equal(loaded.hotbar.filter(Boolean).length, 8, 'the kit survives a round trip');
  assert.equal(loaded.storage[0].id, 'diamond_sword');
});

// --- the session -------------------------------------------------------------------------------------

test('difficulty, dimension, day count and gamerules survive', () => {
  const game = {
    difficulty: 'hard', currentDimension: 'nether', dayCount: 4,
    settings: { gameMode: 'survival', difficulty: 'hard', cheats: false, preset: 'ordinary' },
    gamerules: { keepInventory: true, doMobSpawning: false },
    player: { setGameMode(m) { this.gamemode = m; } },
    world: { selectedBiome: 'all' },
  };
  const saved = captureSessionState(game);
  const loaded = { world: { selectedBiome: 'all' }, player: { setGameMode(m) { this.gamemode = m; } } };
  applySessionState(loaded, saved);

  assert.equal(loaded.difficulty, 'hard');
  assert.equal(loaded.player.difficulty, 'hard', 'and the player follows, so the two agree');
  assert.equal(loaded.currentDimension, 'nether');
  assert.equal(loaded.dayCount, 4);
  assert.deepEqual(loaded.gamerules, { keepInventory: true, doMobSpawning: false });
  assert.equal(loaded.settings.cheats, false);
  assert.equal(loaded.player.gamemode, 'survival', 'mode abilities follow the restored mode');
});

test('a session with no saved settings leaves the running one alone', () => {
  // Loading REPLACES what the save carries, and leaves what it does not carry rather than blanking it.
  const loaded = { difficulty: 'easy', world: {}, player: {} };
  applySessionState(loaded, undefined);
  assert.equal(loaded.difficulty, 'easy');
  assert.equal(applySessionState(null, {}), null);
});

// --- versions ----------------------------------------------------------------------------------------

test('a version 1 save is migrated rather than rejected', () => {
  const v1 = { version: 1, name: 'Old', chunks: [], player: { health: 12, hunger: 4 } };
  const migrated = migrateSave(v1);
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(migrated.migratedFrom, 1, 'the origin is recorded');
  assert.equal(migrated.name, 'Old', 'and the rest of the file is untouched');

  // A current save is left as a current save.
  const v2 = { version: SAVE_VERSION };
  assert.equal(migrateSave(v2).migratedFrom, undefined);
  // A file with no version reads as v1, which is what every pre-version file was.
  assert.equal(migrateSave({ chunks: [] }).migratedFrom, 1);
  // And nothing at all is passed straight through rather than throwing on load.
  assert.equal(migrateSave(null), null);
  assert.equal(migrateSave(undefined), undefined);
});

test('a legacy save loads without a starter kit and without healing', () => {
  // The end-to-end shape of the fix: a v1 file has no saturation, no armour and no bed binding.
  const legacy = migrateSave({ version: 1, player: { health: 12, hunger: 4 }, inventory: { hotbar: [], storage: [] } });
  const player = fullPlayer({ saturation: 5, health: 20 });
  const storedHealth = player.health;
  applyPlayerState(player, legacy.player, makeVec);
  const inv = new Inventory();
  inv.giveDemoKit();
  applyInventoryState(inv, legacy.inventory);

  assert.equal(inv.hotbar.filter(Boolean).length, 0, 'no demo kit is conjured by loading');
  assert.equal(player.saturation, LEGACY_DEFAULTS.saturation);
  assert.equal(player.bedSpawnPosition, null, 'and no bed binding is invented');
  assert.equal(player.deathDropsDone, false);
  // Loading does not touch health; the caller applies the saved value, which was 12, not 20.
  assert.equal(storedHealth, 20, 'the reset is not run on load');
});

// --- the wiring --------------------------------------------------------------------------------------

test('mapManager writes and reads the new fields through the schema', () => {
  const source = readFileSync(new URL('../src/mapManager.js', import.meta.url), 'utf8');
  assert.match(source, /from '\.\/saveSchema\.js'/, 'it uses the schema');
  assert.match(source, /version: SAVE_VERSION/, 'the format is versioned');
  assert.match(source, /capturePlayerState\(game\.player\)/, 'the player capture is the schema');
  assert.match(source, /captureInventoryState\(game\.inventory\)/, 'and so is the inventory');
  assert.match(source, /captureSessionState\(game\)/, 'and the session');
  assert.match(source, /applyPlayerState\(game\.player, p/, 'the restore goes through it too');
  assert.match(source, /applyInventoryState\(game\.inventory, mapData\.inventory\)/);
  assert.match(source, /applySessionState\(game, mapData\.session\)/);
  assert.match(source, /migrateSave\(mapData\)/, 'and an older file is migrated before it is read');

  // The two specific v1 bugs must be gone.
  assert.equal(/p\.hunger \?\? 20/.test(source), false, 'no hunger default of 20');
  assert.equal(/mapData\.inventory\.hotbar\.map/.test(source), false,
    'and the unguarded inventory map that threw');
  // The inventory restore is unconditional, so it replaces rather than merges.
  assert.equal(/\n  if \(mapData\.inventory\) \{/.test(source), false,
    'the guard that let old gear survive a load is gone');
});
