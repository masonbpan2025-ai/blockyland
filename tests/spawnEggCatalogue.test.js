// Item parity batch 6: nine mobs that could be spawned but had no egg, and six eggs nobody could find.
//
// Measured two ways, because the gap had two shapes. `DEBUG_MOBS` listed nine mobs with no
// `<mob>_spawn_egg` item at all -- `spawnMob('vex')` worked and there was no way for a player to ask
// for one. Separately, six eggs were registered as items and reachable in the world but absent from the
// creative catalogue's hand-written list, so they never appeared in the menu; and two entries in that
// list named items that did not exist, so `itemEntry` returned null and the rows were dropped in
// silence.
//
// The assertions below are the two-way comparison that found all of it, plus the name-to-mob check that
// keeps a new egg honest. `tests/spawnEggCoverage.test.js` already covers the third direction -- that
// each egg spawns a mob which is its own type -- so this file does not repeat it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ITEMS } from '../src/blocks.js';
import { DEBUG_MOBS } from '../src/mobDebugSession.js';
import { ALL_CREATIVE_ITEMS } from '../src/creativeCatalog.js';
import { MobLibrary } from '../src/mobLibrary.js';

/**
 * Mob types this game added that are not Minecraft mobs.
 *
 * The tournament and studio characters are deliberately egg-less in vanilla terms: there is no
 * Minecraft mob they correspond to, so "every mob has an egg" cannot mean every entry in DEBUG_MOBS.
 * Named rather than pattern-matched so a new custom mob has to be added here on purpose.
 */
const NON_VANILLA_MOBS = new Set(['tournament_host', 'site_manager', 'jackie_chun']);

const registeredEggs = () => Object.keys(ITEMS).filter((id) => ITEMS[id].type === 'spawn_egg');
const catalogueEggIds = () => ALL_CREATIVE_ITEMS
  .filter((entry) => entry.tab === 'spawn_eggs')
  .map((entry) => String(entry.id));

// --- the gap that was fixed --------------------------------------------------

test('every vanilla mob has a spawn egg', () => {
  const covered = new Set(registeredEggs().map((id) => ITEMS[id].mob));
  const missing = DEBUG_MOBS.filter((mob) => !NON_VANILLA_MOBS.has(mob) && !covered.has(mob));
  assert.deepEqual(missing, [], 'these mobs can be spawned but have no egg a player can hold');
});

test('the nine eggs this batch added name the right mobs', () => {
  const expected = {
    enderman_spawn_egg: 'enderman',
    mooshroom_spawn_egg: 'mooshroom',
    ocelot_spawn_egg: 'ocelot',
    pufferfish_spawn_egg: 'pufferfish',
    shulker_spawn_egg: 'shulker',
    trader_llama_spawn_egg: 'trader_llama',
    tropical_fish_spawn_egg: 'tropical_fish',
    vex_spawn_egg: 'vex',
    zoglin_spawn_egg: 'zoglin',
  };
  for (const [id, mob] of Object.entries(expected)) {
    assert.ok(ITEMS[id], `${id} must be registered`);
    assert.equal(ITEMS[id].mob, mob);
    assert.equal(ITEMS[id].type, 'spawn_egg');
    assert.ok(ITEMS[id].name.endsWith('Spawn Egg'), `${id} should be named as an egg`);
  }
});

test('each new egg has an icon file at the path it declares', () => {
  for (const id of ['enderman', 'mooshroom', 'ocelot', 'pufferfish', 'shulker', 'trader_llama', 'tropical_fish', 'vex', 'zoglin']) {
    const icon = ITEMS[`${id}_spawn_egg`].icon;
    const file = join(process.cwd(), 'public', icon.replace(/^\//, ''));
    assert.ok(existsSync(file), `${id}_spawn_egg declares ${icon}, which does not exist`);
  }
});

// --- the two-way catalogue comparison ---------------------------------------

test('the creative catalogue and the registry name exactly the same eggs', () => {
  // This is the assertion that found the batch. One direction is an egg nobody can find in the menu;
  // the other is a menu row that silently resolves to nothing, because `itemEntry` returns null for an
  // item that does not exist and the caller drops it.
  //
  // The catalogue also synthesises `spawn_egg_<id>` rows for the game's own MobLibrary mobs -- a fire
  // dragon, a pikachu -- which are not Minecraft mobs and have no ITEMS entry by design. Those are
  // held to their own check below rather than being waved through here.
  const catalogue = new Set(catalogueEggIds());
  const registry = new Set(registeredEggs());
  const unlisted = [...registry].filter((id) => !catalogue.has(id)).sort();
  const unresolvable = [...catalogue]
    .filter((id) => !registry.has(id) && !id.startsWith('spawn_egg_'))
    .sort();
  assert.deepEqual(unlisted, [], 'registered eggs that never appear in the creative menu');
  assert.deepEqual(unresolvable, [], 'catalogue rows naming an egg that does not exist');
});

test('every synthesised egg names a mob the library actually has', () => {
  // The escape hatch above is only for generated rows, and a generated row is only legitimate when the
  // mob exists: otherwise it is a menu entry that spawns nothing.
  const libraryMobs = new Set(MobLibrary.getAllMobs().map((mob) => mob.id));
  const synthesised = catalogueEggIds().filter((id) => id.startsWith('spawn_egg_'));
  assert.ok(synthesised.length > 0, 'the game has custom mobs, so there should be synthesised eggs');
  for (const id of synthesised) {
    assert.ok(libraryMobs.has(id.replace(/^spawn_egg_/, '')), `${id} names a mob the library does not have`);
  }
});

test('a mob does not get two eggs from the catalogue', () => {
  // `enderman` is a built-in `MobLibrary` mob, so the catalogue also synthesises a `spawn_egg_<id>` for
  // it. Adding the real `enderman_spawn_egg` had to make that synthesis skip, or the menu would offer
  // the same mob twice under two ids. The skip only fires when the mob is built in AND its id is in the
  // hand-written list, which is why the list had to be updated in the same change.
  const enderman = catalogueEggIds().filter((id) => /enderman/.test(id));
  assert.deepEqual(enderman, ['enderman_spawn_egg']);
});

test('every egg is registered under the vanilla id, not a synthesised one', () => {
  for (const id of registeredEggs()) {
    assert.doesNotMatch(id, /^spawn_egg_/, `${id} should be the vanilla id, not a generated one`);
  }
});

// --- the catalogue list stays in step ---------------------------------------

test('the catalogue egg list is not a second source of truth that can drift', () => {
  // The list is hand-written, which is how it fell six behind. It is now checked in both directions by
  // a test rather than by a comment, so falling behind fails here rather than in a play session.
  const source = readFileSync(join(process.cwd(), 'src', 'creativeCatalog.js'), 'utf8');
  const listed = [...source.matchAll(/'([a-z0-9_]+_spawn_egg)'/g)].map((m) => m[1]);
  assert.equal(new Set(listed).size, listed.length, 'the list should not name the same egg twice');
  assert.equal(listed.length, registeredEggs().length, 'and should hold exactly the registered eggs');
});
