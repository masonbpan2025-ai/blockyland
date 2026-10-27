// The mod structure.
//
// References: https://docs.fabricmc.net/develop/getting-started/project-structure ·
//             https://docs.neoforged.net/docs/concepts/registries/
//
// The property this suite exists to protect is stated once and asserted from several directions: **the core
// does not depend on any designed world.** A world is a directory; the loader reaches it; deleting the
// directory leaves the game working.
//
// So the tests come in three groups:
//
//   * The registry's rules, which are what make namespacing worth having -- a mod cannot write into the core
//     namespace, two mods cannot collide, and a scope narrows a view without hiding cross-references.
//   * The loader's lifetime -- load, register, unload, and the fields the mod attached to the game go with it.
//   * The ISOLATION ITSELF, asserted against the source of the core modules rather than against a running
//     game, because "the core does not import the mod" is a fact about the import graph.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  CORE_NAMESPACE, KIND, SCOPE, ContentRegistry,
  isValidName, joinName, normaliseNamespace, splitName,
} from '../src/mods/registry.js';
import {
  BUILTIN_MODS, MODS_DIRECTORY, ModApi, ModLoader, discoverMods,
  modForMap, modForMechanism, resolveWorldMechanism,
} from '../src/mods/loader.js';
// The filesystem half. Node-only, and deliberately not reachable from `main.js`.
import { loadModTable, readModManifest } from '../src/mods/manifestFile.js';
import { allModContent, inspectorScope, inspectorSources, manifestContent } from '../src/mods/inspectorScope.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// --- the registry ---------------------------------------------------------------------------------------

test('a name is a namespace and a path, and a bare name is core', () => {
  assert.deepEqual(splitName('minecraft:stone'), { namespace: 'minecraft', path: 'stone' });
  assert.deepEqual(splitName('stone'), { namespace: CORE_NAMESPACE, path: 'stone' });
  assert.deepEqual(splitName('dragonball_tournament:jackie_chun'),
    { namespace: 'dragonball_tournament', path: 'jackie_chun' });
  // Case, spaces and hyphens fold, as every other id in this codebase does.
  assert.equal(joinName('My-Mod', 'Some Block'), 'my_mod:some_block');
  assert.equal(normaliseNamespace(''), CORE_NAMESPACE);
  assert.equal(isValidName('minecraft:stone'), true);
  assert.equal(isValidName('minecraft:'), false, 'an empty path is not a name');
  assert.equal(isValidName(''), false, 'nor is an empty name');
  // A raw space does NOT make a name invalid, because `splitName` normalises it away first. Asserted rather
  // than assumed: the first version of this test expected `false` here and was wrong about its own code.
  assert.equal(isValidName('bad namespace:x'), true, 'normalised before it is checked');
  assert.equal(splitName('bad namespace:x').namespace, 'bad_namespace');
});

test('a block and an item may share a name, as they do in vanilla', () => {
  // `minecraft:stone` is in both registries; they are separate maps for exactly this reason.
  const registry = new ContentRegistry();
  assert.equal(registry.register({ kind: KIND.BLOCK, name: 'stone' }).ok, true);
  assert.equal(registry.register({ kind: KIND.ITEM, name: 'stone' }).ok, true);
  assert.deepEqual(registry.kindsOf('stone').sort(), ['block', 'item']);
  // But the same kind twice is a collision.
  const again = registry.register({ kind: KIND.BLOCK, name: 'minecraft:stone' });
  assert.equal(again.ok, false);
  assert.match(again.reason, /already registered/);
});

test('a mod may not register into the core namespace', () => {
  // The one rule that keeps a mod from shadowing the game's own content. Without it, a mod could replace
  // `minecraft:stone` and every core table would silently be wrong.
  const registry = new ContentRegistry();
  const result = registry.register({ kind: KIND.BLOCK, name: 'minecraft:stone', modId: 'some_mod' });
  assert.equal(result.ok, false);
  assert.match(result.reason, /may not register into the core namespace/);
  assert.equal(registry.has(KIND.BLOCK, 'minecraft:stone'), false);
});

test('two mods cannot collide, and the same path in each is fine', () => {
  const registry = new ContentRegistry();
  assert.equal(registry.register({ kind: KIND.BLOCK, name: 'ki_block', modId: 'mod_a' }).ok, true);
  assert.equal(registry.register({ kind: KIND.BLOCK, name: 'ki_block', modId: 'mod_b' }).ok, true);
  assert.equal(registry.has(KIND.BLOCK, 'mod_a:ki_block'), true);
  assert.equal(registry.has(KIND.BLOCK, 'mod_b:ki_block'), true);
  assert.equal(registry.register({ kind: KIND.BLOCK, name: 'ki_block', modId: 'mod_a' }).ok, false);
  assert.deepEqual(registry.modIds(), ['mod_a', 'mod_b']);
});

test('an unknown kind is refused rather than inventing a registry', () => {
  const registry = new ContentRegistry();
  const result = registry.register({ kind: 'spell', name: 'fireball' });
  assert.equal(result.ok, false);
  assert.match(result.reason, /unknown kind/);
});

test('a scope narrows the view and the counts follow it', () => {
  const registry = new ContentRegistry();
  registry.register({ kind: KIND.BLOCK, name: 'stone' });
  registry.register({ kind: KIND.BLOCK, name: 'ki_block', modId: 'dragonball_tournament' });

  assert.deepEqual(registry.names(KIND.BLOCK), ['minecraft:stone'], 'the default is core only');
  assert.deepEqual(registry.names(KIND.BLOCK, { scope: SCOPE.MOD }), ['dragonball_tournament:ki_block']);
  assert.equal(registry.names(KIND.BLOCK, { scope: 'all' }).length, 2);
  assert.deepEqual(registry.names(KIND.BLOCK, { modId: 'dragonball_tournament' }), ['dragonball_tournament:ki_block']);

  const summary = registry.summary();
  assert.equal(summary.core.block, 1);
  assert.equal(summary.mod.block, 1);
});

test('unregistering a mod takes only that mod', () => {
  const registry = new ContentRegistry();
  registry.register({ kind: KIND.MOB, name: 'zombie' });
  registry.register({ kind: KIND.MOB, name: 'jackie_chun', modId: 'dragonball_tournament' });
  registry.register({ kind: KIND.MOB, name: 'other', modId: 'another_mod' });

  const removed = registry.unregisterMod('dragonball_tournament');
  assert.equal(removed, 1);
  assert.equal(registry.has(KIND.MOB, 'dragonball_tournament:jackie_chun'), false);
  assert.equal(registry.has(KIND.MOB, 'zombie'), true, 'core is untouched');
  assert.equal(registry.has(KIND.MOB, 'another_mod:other'), true, 'and so is another mod');
  assert.deepEqual(registry.modIds(), ['another_mod'], 'the owner index is cleaned up too');
});

// --- manifests ------------------------------------------------------------------------------------------

test('the shipped mod manifests are valid and agree with the built-in table', () => {
  const { mods, rejected } = discoverMods();
  assert.deepEqual(rejected, [], 'every built-in mod has a readable manifest');
  assert.equal(mods.length, BUILTIN_MODS.length);
  assert.deepEqual(mods.map(m => m.id), BUILTIN_MODS.map(m => m.id));

  for (const manifest of mods) {
    assert.match(manifest.id, /^[a-z0-9_]+$/, `${manifest.id} is a legal namespace`);
    assert.ok(manifest.name, `${manifest.id} has a name`);
    assert.ok(manifest.entrypoint, `${manifest.id} names an entrypoint`);
    assert.notEqual(manifest.id, CORE_NAMESPACE, 'a mod may not be core');
    // The entrypoint file must actually exist: a manifest naming a file that is not there is a mod that fails
    // at load time in the browser and nowhere else, which is the worst place to find out.
    assert.ok(existsSync(join(ROOT, manifest.directory, manifest.entrypoint.replace(/^\.\//, ''))),
      `${manifest.id}: ${manifest.entrypoint} exists`);
  }
});

test('a manifest is validated rather than trusted', () => {
  const registry = new ContentRegistry();
  assert.equal(registry.register({ kind: KIND.BLOCK, name: 'x' }).ok, true);
  // A missing id, a bad id, a missing name and a core namespace are all refused.
  for (const bad of [{}, { id: 'a' }, { id: 'a', name: 'A', provides: 'nope' }, { id: 'minecraft', name: 'X' }]) {
    const result = readModManifestFromObject(bad);
    assert.equal(result.ok, false, JSON.stringify(bad));
  }
});

/** The same validation `readModManifest` applies, without needing a file on disk. */
function readModManifestFromObject(raw) {
  const problems = [];
  if (!raw.id) problems.push('id is required');
  else if (!/^[a-z0-9_]+$/.test(normaliseNamespace(raw.id))) problems.push('id must be lower case');
  if (!raw.name) problems.push('name is required');
  if (normaliseNamespace(raw.id) === CORE_NAMESPACE) problems.push('a mod may not use the core namespace');
  if (raw.provides && typeof raw.provides !== 'object') problems.push('provides must be an object');
  return problems.length ? { ok: false, reason: problems.join('; ') } : { ok: true };
}

test('reading a manifest that is not there reports why instead of throwing', () => {
  const missing = readModManifest(join(ROOT, 'src/mods/does-not-exist/mod.json'));
  assert.equal(missing.ok, false);
  assert.match(missing.reason, /does not exist/);
});

// --- the loader -----------------------------------------------------------------------------------------

/** A loader whose entrypoints are supplied, so no test needs the filesystem or a real import. */
function loaderWith(entrypoints, mods) {
  const table = mods ?? [
    { id: 'test_mod', name: 'Test Mod', version: '1.0.0', mechanism: 'test_mechanism', maps: ['Test.json'], provides: { mobs: ['test_mob'] } },
  ];
  return new ModLoader({
    mods: table.map(m => ({ ...m, directory: `${MODS_DIRECTORY}/test`, entrypoint: './index.js', maps: m.maps ?? [] })),
    importModule: async (spec) => entrypoints[spec] ?? entrypoints.default,
  });
}

test('loading a mod calls its entrypoint and registers its content', async () => {
  const registry = new ContentRegistry();
  const loader = loaderWith({
    default: {
      register(api) {
        api.registerBlock('ki_block', { name: 'Ki Block' });
        api.registerMob('test_mob', { name: 'Test Mob' });
        api.registerMechanism('test_mechanism', { id: 'test_mechanism', features: {} });
      },
    },
  });
  loader.registry = registry;

  const result = await loader.load('test_mod', { game: { mechanisms: null } });
  assert.equal(result.ok, true, result.reason);
  assert.equal(loader.isLoaded('test_mod'), true);
  assert.equal(registry.has(KIND.BLOCK, 'test_mod:ki_block'), true, 'namespaced to the mod');
  assert.equal(registry.has(KIND.MOB, 'test_mod:test_mob'), true);
  assert.equal(loader.mechanisms.has('test_mechanism'), true, 'and the mechanism is registered');
});

test('a mod that throws while registering is reported and does not half-load', async () => {
  const loader = loaderWith({ default: { register() { throw new Error('boom'); } } });
  const result = await loader.load('test_mod', {});
  assert.equal(result.ok, false);
  assert.match(result.reason, /boom/);
  assert.equal(loader.isLoaded('test_mod'), false);
  assert.equal(loader.get('test_mod').status, 'failed');
});

test('an entrypoint without register() is refused with a message that says so', async () => {
  const loader = loaderWith({ default: { notRegister() {} } });
  const result = await loader.load('test_mod', {});
  assert.equal(result.ok, false);
  assert.match(result.reason, /must export a register\(api\) function/);
});

test('an entrypoint that cannot be imported is reported rather than thrown', async () => {
  const loader = new ModLoader({
    mods: [{ id: 'broken', name: 'Broken', directory: 'x', entrypoint: './index.js' }],
    importModule: async () => { throw new Error('no such module'); },
  });
  const result = await loader.load('broken', {});
  assert.equal(result.ok, false);
  assert.match(result.reason, /could not be imported/);
});

test('unloading a mod removes its content, its mechanism AND the fields it attached', async () => {
  // The last one is the point: an unloaded mod has to stop existing, not linger as a stale object the core
  // still calls into.
  const registry = new ContentRegistry();
  const game = { mechanisms: null, tournament: undefined };
  const loader = new ModLoader({
    registry,
    mods: [{ id: 'test_mod', name: 'Test', directory: 'x', entrypoint: './index.js' }],
    importModule: async () => ({
      register(api) {
        api.registerMob('m');
        api.attach('tournament', { name: 'a manager' });
      },
    }),
  });

  await loader.load('test_mod', { game });
  assert.equal(registry.has(KIND.MOB, 'test_mod:m'), true);
  assert.equal(typeof game.tournament, 'object', 'attached to the game');

  loader.unload('test_mod');
  assert.equal(registry.has(KIND.MOB, 'test_mod:m'), false, 'content withdrawn');
  assert.equal(game.tournament, undefined, 'the original attachment value is restored');
  assert.equal(loader.isLoaded('test_mod'), false);
});

test('a mod may ask whether something is registered, which is how it checks for another mod', () => {
  const registry = new ContentRegistry();
  registry.register({ kind: KIND.BLOCK, name: 'stone' });
  const api = new ModApi({ registry, loader: {}, modId: 'test_mod' });
  assert.equal(api.exists(KIND.BLOCK, 'stone'), true);
  assert.equal(api.exists(KIND.BLOCK, 'nonexistent:thing'), false);
});

test('a manifest decides which world owns a map, so the core names none', () => {
  const { mods } = discoverMods();
  const found = modForMap(mods, 'World_Martial_Arts_Tournament.json');
  assert.ok(found, 'the designed world map is claimed by a mod');
  assert.equal(found.id, 'dragonball_tournament');
  assert.equal(modForMap(mods, 'Some_Generated_World.json'), null, 'an unclaimed map belongs to nobody');
  assert.equal(modForMechanism(mods, 'dragonball_tournament')?.id, 'dragonball_tournament');
  assert.equal(modForMechanism(mods, 'default'), null, 'the core mechanism is not a mod');
});

test('resolveWorldMechanism answers from the mod table for every kind of map', () => {
  const loader = { available: discoverMods().mods };
  // An explicit mechanism on the map wins.
  const explicit = resolveWorldMechanism(loader, { mechanism: 'dragonball_tournament' });
  assert.equal(explicit.mechanismId, 'dragonball_tournament');
  assert.equal(explicit.modId, 'dragonball_tournament');
  // Otherwise the filename decides.
  const byFile = resolveWorldMechanism(loader, { filename: 'World_Martial_Arts_Tournament.json' });
  assert.equal(byFile.modId, 'dragonball_tournament');
  // And a map no mod claims runs on the core's own mechanism.
  const plain = resolveWorldMechanism(loader, { filename: 'My_Survival_World.json' });
  assert.deepEqual(plain, { mechanismId: 'default', modId: null, manifest: null });
  // A loader with no mods is not a crash.
  assert.equal(resolveWorldMechanism(null, {}).mechanismId, 'default');
});

test('the mod table read from disk matches the shipped table', () => {
  // `loadModTable` scans the directory; `BUILTIN_MODS` is what the browser build knows. If they disagree, one
  // of them is stale, and a mod would work in the CLI and not in the game.
  const scanned = loadModTable();
  assert.deepEqual(scanned.mods.map(m => m.id).sort(), BUILTIN_MODS.map(m => m.id).sort());
  // And every directory under src/mods that has a manifest is in the table.
  const onDisk = readdirSync(join(ROOT, MODS_DIRECTORY), { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(join(ROOT, MODS_DIRECTORY, d.name, 'mod.json')))
    .map(d => d.name.replace(/-/g, '_'));
  assert.deepEqual(onDisk.sort(), BUILTIN_MODS.map(m => m.id).sort(),
    'a mod directory that is not in BUILTIN_MODS would never load');
});

// --- isolation ------------------------------------------------------------------------------------------

test('NO core module imports a mod', () => {
  // This is the property the whole restructure is for. Asserted against the import graph rather than against
  // behaviour, because "the core does not depend on the mod" is a fact about imports: a core file that
  // imported `mods/dragonball-tournament/...` would work fine and quietly destroy the isolation.
  const coreFiles = readdirSync(join(ROOT, 'src'), { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith('.js'))
    .map(d => `src/${d.name}`);

  // `mods/loader.js` and `mods/registry.js` are core infrastructure and may not import a mod either; only a
  // mod's own directory may reference its modules.
  const coreModFiles = ['src/mods/loader.js', 'src/mods/registry.js', 'src/mods/inspectorScope.js'];

  for (const file of [...coreFiles, ...coreModFiles]) {
    const source = read(file);
    const offenders = [...source.matchAll(/from\s+'([^']*mods\/[a-z0-9_-]+\/[^']*)'/g)]
      .map(m => m[1])
      // A reference to the loader/registry/inspectorScope is core infrastructure, not a mod.
      .filter(spec => !/\/(loader|registry|inspectorScope)\.js$/.test(spec));
    assert.deepEqual(offenders, [], `${file} imports a mod: ${offenders.join(', ')}`);
  }
});

test('the four managers of the designed world live in the mod directory, not in src/', () => {
  for (const name of ['tournament', 'dragonballSkills', 'trainingSites', 'dungeonMode']) {
    assert.equal(existsSync(join(ROOT, `src/${name}.js`)), false, `src/${name}.js must have moved`);
    assert.ok(existsSync(join(ROOT, `src/mods/dragonball-tournament/${name}.js`)),
      `src/mods/dragonball-tournament/${name}.js must exist`);
  }
});

test('main.js no longer imports any designed world, and guards what the mod may attach', () => {
  const main = read('src/main.js');
  // The four imports are gone.
  for (const name of ['tournament', 'dragonballSkills', 'trainingSites', 'dungeonMode']) {
    assert.ok(!new RegExp(`from '\\./${name}\\.js'`).test(main), `main.js must not import ./${name}.js`);
  }
  // And every use of what the mod attaches is guarded, because the field is absent when the mod is not
  // loaded -- which is the state the core has to survive. A guard may be on the same line OR on a line just
  // above it: `if (this.trainingSites) { const site = this.trainingSites.sites... }` is guarded, and the first
  // version of this check called it unguarded because it only looked at one line.
  for (const field of ['tournament', 'trainingSites', 'dragonballSkills', 'dungeonMode']) {
    const lines = main.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!new RegExp(`this\\.${field}(?![a-zA-Z0-9_])`).test(lines[i])) continue;
      // An ASSIGNMENT is not a use: `this.tournament = null` on a world reset is how the field is cleared, and
      // it is safe whether or not the mod ever attached one.
      if (new RegExp(`this\\.${field}\\s*=[^=]`).test(lines[i])) continue;
      const window = lines.slice(Math.max(0, i - 5), i + 1).join('\n');
      assert.ok(
        new RegExp(`this\\.${field}\\?\\.|if \\(this\\.${field}|this\\.${field} &&|!this\\.${field}\\?\\.`).test(window),
        `unguarded use of this.${field} near line ${i + 1}: ${lines[i].trim()}`,
      );
    }
  }
});

test('the core mechanism manager knows only its own mechanism', () => {
  const source = read('src/worldMechanisms.js');
  const ids = /export const MECHANISM_IDS = \{([^}]*)\}/.exec(source);
  assert.ok(ids, 'MECHANISM_IDS is still exported');
  assert.match(ids[1], /DEFAULT/, 'the core supplies default');
  assert.ok(!/DRAGONBALL|dragonball_tournament/.test(ids[1]),
    'and does not list a designed world as one of its own');
  // The registry seam the mod registers through survives.
  assert.match(source, /registerMechanism\(id, mechanismDef\)/);
  assert.match(source, /registerWorldCleanup\(cleanup\)/);
});

test('the mod directory contains the world it owns, and nothing outside names it as a dependency', () => {
  const modFiles = readdirSync(join(ROOT, 'src/mods/dragonball-tournament'));
  for (const expected of ['mod.json', 'index.js', 'tournament.js', 'dragonballSkills.js', 'trainingSites.js', 'dungeonMode.js']) {
    assert.ok(modFiles.includes(expected), `the mod is missing ${expected}`);
  }
  // Its own modules are self-contained: they import nothing from the core except the engine itself.
  for (const name of ['tournament', 'dragonballSkills', 'trainingSites', 'dungeonMode']) {
    const source = read(`src/mods/dragonball-tournament/${name}.js`);
    const imports = [...source.matchAll(/^import .*from '([^']+)'/gm)].map(m => m[1]);
    for (const spec of imports) {
      assert.ok(spec === 'three' || spec.startsWith('./') || spec.startsWith('../'),
        `${name}.js imports '${spec}', which is neither the engine nor its own directory`);
    }
  }
});

// --- browser safety -------------------------------------------------------------------------------------

test('the mod table carries its manifests as data, so the browser needs no filesystem', () => {
  // The first version called `discoverMods()` from the `ModLoader` constructor, and `discoverMods` read the
  // manifests with `readFileSync`. In a browser build that is not a slow path, it is a throw -- while the GAME
  // constructs its own loader. Caught before it shipped, and pinned here.
  for (const entry of BUILTIN_MODS) {
    assert.ok(entry.manifest, `${entry.id} must carry its manifest inline`);
    assert.equal(typeof entry.load, 'function', `${entry.id} must carry a static import thunk`);
  }
  // The default discovery path touches no file: it is pure data plus validation.
  const inline = discoverMods();
  assert.equal(inline.rejected.length, 0);
  assert.equal(inline.mods.length, BUILTIN_MODS.length);
  assert.ok(inline.mods[0].provides, 'the inline manifest is fully populated');
});

test('the inline manifest and the file on disk agree', () => {
  // Two copies of one manifest is a drift risk, so the risk is tested rather than trusted. If somebody edits
  // `mod.json` and not the table -- or the reverse -- a mod would behave differently in the CLI and the game.
  const inline = discoverMods();
  const disk = discoverMods({ fromDisk: true, readManifest: readModManifest });
  assert.deepEqual(disk.rejected, []);
  for (let i = 0; i < BUILTIN_MODS.length; i++) {
    assert.equal(inline.mods[i].id, disk.mods[i].id);
    assert.equal(inline.mods[i].name, disk.mods[i].name);
    assert.equal(inline.mods[i].mechanism, disk.mods[i].mechanism);
    assert.deepEqual(inline.mods[i].maps, disk.mods[i].maps);
    assert.deepEqual(inline.mods[i].provides, disk.mods[i].provides);
    assert.equal(inline.mods[i].entrypoint, disk.mods[i].entrypoint);
  }
});

test('the entrypoint is reached through the static import, and really registers', async () => {
  // Not a stub: this is the mod's own `index.js`, imported the way the game imports it. It is the only test
  // that proves the wiring end to end -- content, mechanism, cleanup hook and the attached managers.
  const loader = new ModLoader();
  const registered = [];
  const cleanups = [];
  const game = {
    mechanisms: {
      registerMechanism: (id, def) => registered.push({ id, def }),
      registerWorldCleanup: (fn) => { cleanups.push(fn); return true; },
    },
  };
  const result = await loader.load('dragonball_tournament', { game });
  assert.equal(result.ok, true, result.reason);

  // The mechanism went into the GAME's registry, not a side table, so `setMechanism` will find it.
  assert.ok(registered.some(r => r.id === 'dragonball_tournament'));
  assert.equal(registered[0].def.modId, 'dragonball_tournament', 'and is marked as the mod’s');
  assert.equal(registered[0].def.features.hasDragonBallSkills, true);
  // And the core was handed a cleanup hook, which is how it undoes a world it cannot name.
  assert.equal(cleanups.length, 1);
  // The content landed in the mod's own namespace.
  assert.equal(loader.registry.has(KIND.MOB, 'dragonball_tournament:tournament_host'), true);
  assert.equal(loader.registry.has(KIND.MOB, 'dragonball_tournament:jackie_chun'), true);
  // Paths are normalised to lower case, like every other id in this codebase, and dots are legal in a path --
  // so the map registers as `...world_martial_arts_tournament.json`.
  assert.equal(loader.registry.has(KIND.MAP, 'dragonball_tournament:world_martial_arts_tournament.json'), true);
  // The managers were attached under the names the core guards.
  assert.equal(typeof game.tournament, 'object');
  assert.equal(typeof game.trainingSites, 'object');
  assert.equal(typeof game.dragonballSkills, 'object');
  assert.equal(typeof game.dungeonMode, 'object');

  // Unloading takes all of it back, including the fields.
  loader.unload('dragonball_tournament');
  assert.equal(loader.registry.has(KIND.MOB, 'dragonball_tournament:tournament_host'), false);
  assert.equal('tournament' in game, false);
});

test('the loader never touches the filesystem on its default path', () => {
  // Asserted on the source: the loader imports `node:fs`, and the one call that matters is guarded by the
  // inline-manifest branch. A future edit that puts `readFileSync` back on the default path fails here.
  const source = read('src/mods/loader.js');
  const constructorLine = source.slice(source.indexOf('constructor('), source.indexOf('constructor(') + 400);
  assert.ok(!/readFileSync|existsSync|readdirSync/.test(constructorLine),
    'the constructor must not read a file: the browser has no filesystem');
  assert.match(source, /fromDisk \|\| !raw/, 'reading from disk is opt-in');
});

// --- the browser path must stay browser-legal ----------------------------------------------------------
//
// This section exists because of a real outage. `loader.js` imported its manifest with
// `import m from './mod.json' with { type: 'json' }`. Node resolves that fine, so every test here passed --
// but Vite rewrites the specifier to `mod.json?import` and serves it as `text/javascript`, while the import
// attribute still demands JSON. Chrome rejects the mismatch, the module graph dies, `main.js` never runs, and
// every button on the start screen does nothing.
//
// Nothing about that is visible from Node, so it is checked by reading the source.

/** Every module reachable from the page entry, by following relative imports. */
function browserReachableModules() {
  const queue = ['src/main.js', 'src/progressOverlay.js'];
  const seen = new Set();
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file) || !existsSync(join(ROOT, file))) continue;
    seen.add(file);
    for (const m of read(file).matchAll(/from\s+'(\.[^']+)'/g)) {
      const base = file.slice(0, file.lastIndexOf('/'));
      const parts = `${base}/${m[1]}`.split('/');
      const out = [];
      for (const p of parts) {
        if (p === '.' || p === '') continue;
        if (p === '..') out.pop();
        else out.push(p);
      }
      queue.push(out.join('/'));
    }
  }
  return [...seen];
}

test('no module the browser loads imports a Node builtin', () => {
  // Vite stubs `node:fs` in dev and tree-shakes it from the build, so a dead import appears to work -- which is
  // exactly why it has to be asserted rather than trusted.
  const offenders = [];
  for (const file of browserReachableModules()) {
    const source = read(file);
    for (const m of source.matchAll(/from\s+'(node:[^']+)'/g)) {
      const lineStart = source.lastIndexOf('\n', m.index) + 1;
      const line = source.slice(lineStart, source.indexOf('\n', m.index));
      if (/^\s*(import|export)/.test(line)) offenders.push(`${file}: ${m[1]}`);
    }
  }
  assert.deepEqual(offenders, [], `browser-reachable modules must not import Node builtins:\n  ${offenders.join('\n  ')}`);
});

test('no module the browser loads uses a JSON import attribute', () => {
  // The specific form that caused the outage: Vite serves `.json` as JavaScript, so `with { type: 'json' }`
  // makes the browser refuse the module.
  const offenders = [];
  for (const file of browserReachableModules()) {
    for (const m of read(file).matchAll(/^\s*import[^\n]*with\s*\{\s*type:\s*['"]json['"]/gm)) {
      offenders.push(`${file}: ${m[0].trim().slice(0, 70)}`);
    }
  }
  assert.deepEqual(offenders, [], `JSON import attributes break the browser build:\n  ${offenders.join('\n  ')}`);
});

test('the manifest reaches the browser as a JS module, and matches mod.json', () => {
  // `manifest.js` is the bundler-safe form; `mod.json` is canonical. Two copies is a drift risk, so the risk is
  // tested rather than trusted -- this assertion is what makes the pair safe.
  const js = read('src/mods/dragonball-tournament/manifest.js');
  assert.match(js, /export default \{/);
  // Checked on import LINES, not on the whole file: `manifest.js` explains the attribute it is avoiding, and a
  // whole-file regex matches that comment -- which is how this assertion failed the first time it ran.
  const attributeImports = [...js.matchAll(/^\s*import[^\n]*with\s*\{\s*type:\s*['"]json['"]/gm)];
  assert.deepEqual(attributeImports, [], 'manifest.js must not use a JSON import attribute');

  const fromJs = discoverMods();
  const fromDisk = discoverMods({ fromDisk: true, readManifest: readModManifest });
  assert.deepEqual(fromJs.rejected, []);
  assert.deepEqual(fromDisk.rejected, []);
  assert.deepEqual(fromJs.mods[0].provides, fromDisk.mods[0].provides, 'manifest.js and mod.json agree');
  assert.equal(fromJs.mods[0].id, fromDisk.mods[0].id);
  assert.equal(fromJs.mods[0].mechanism, fromDisk.mods[0].mechanism);
  assert.deepEqual(fromJs.mods[0].maps, fromDisk.mods[0].maps);
});

test('the loader and registry work with no filesystem at all', async () => {
  // The strongest form of the same claim: use them fresh, with no Node I/O anywhere on the path.
  const { ModLoader: FreshLoader, discoverMods: freshDiscover } = await import('../src/mods/loader.js');
  const { ContentRegistry: FreshRegistry } = await import('../src/mods/registry.js');
  assert.equal(freshDiscover().mods.length, BUILTIN_MODS.length);
  const loader = new FreshLoader({ registry: new FreshRegistry() });
  assert.equal(loader.list().length, BUILTIN_MODS.length);
  assert.equal(loader.activeModId, null);
  assert.deepEqual(loader.inspectorScope(), { scope: SCOPE.CORE, modId: null });
  // And the disk path REFUSES rather than throwing a ReferenceError at a caller with no reader.
  const refused = freshDiscover({ fromDisk: true });
  assert.equal(refused.mods.length, 0);
  assert.match(refused.rejected[0].reason, /needs a readManifest/);
});

// --- the Inspector --------------------------------------------------------------------------------------

test('the Inspector defaults to the base game and shows no mod content', () => {
  const scope = inspectorScope({ manifests: discoverMods().mods });
  assert.equal(scope.scope, SCOPE.CORE);
  assert.equal(scope.modId, null);
  assert.equal(scope.label, 'Base game');
  assert.deepEqual(scope.entries, [], 'nothing from a mod is visible until one is selected');
  // But the mods are OFFERED, because the player has to be able to select one.
  assert.deepEqual(scope.availableMods.map(m => m.id), BUILTIN_MODS.map(m=>m.id));
});

test('selecting a designed world shows that world content and only that world content', () => {
  const scope = inspectorScope({ modId: 'dragonball_tournament', manifests: discoverMods().mods });
  assert.equal(scope.scope, SCOPE.MOD);
  assert.equal(scope.modId, 'dragonball_tournament');
  assert.equal(scope.label, 'Dragon Ball World Tournament');
  assert.ok(scope.entries.length > 0);
  // Every entry is namespaced to the mod and to no other.
  for (const entry of scope.entries) {
    assert.match(entry.name, /^dragonball_tournament:/, `${entry.name} must be namespaced`);
    assert.equal(entry.modId, 'dragonball_tournament');
  }
  assert.ok(scope.entries.some(e => e.kind === KIND.MOB && e.path === 'tournament_host'));
  assert.ok(scope.entries.some(e => e.kind === KIND.MOB && e.path === 'jackie_chun'));
});

test('the Inspector defaults to core even while a mod world is active', () => {
  const loader = { activeModId: null };
  assert.equal(inspectorScope({ loader, manifests: discoverMods().mods }).scope, SCOPE.CORE);
  loader.activeModId = 'dragonball_tournament';
  assert.equal(inspectorScope({ loader, manifests: discoverMods().mods }).scope, SCOPE.CORE);
  const selected = inspectorScope({ loader, modId: 'dragonball_tournament', manifests: discoverMods().mods });
  assert.equal(selected.scope, SCOPE.MOD);
  assert.equal(selected.modId, 'dragonball_tournament');
  // An explicit selection wins over the loader, so the Inspector can browse without opening a world.
  assert.equal(inspectorScope({ loader, modId: null, manifests: discoverMods().mods }).scope, SCOPE.CORE);
});

test('selecting a world that does not exist falls back to the base game and says so', () => {
  const scope = inspectorScope({ modId: 'not_a_mod', manifests: discoverMods().mods });
  assert.equal(scope.scope, SCOPE.CORE);
  assert.equal(scope.unknownMod, 'not_a_mod');
});

test('manifest content is read without loading the mod', () => {
  // The same reason `fabric.mod.json` exists: metadata must be readable without running the code, or listing
  // a world's content would cost a Three.js import.
  const { mods } = discoverMods();
  // By id: the packages are listed alphabetically, and which comes first changes as packages are added.
  const content = manifestContent(mods.find((m) => m.id === 'dragonball_tournament'));
  assert.ok(content.length > 0);
  for (const entry of content) {
    assert.equal(entry.modId, 'dragonball_tournament');
    assert.match(entry.name, /^dragonball_tournament:/);
    assert.ok(typeof entry.data?.name === 'string', 'a manifest declares a display name');
  }
  assert.equal(allModContent(mods).length, mods.reduce((total,m)=>total+manifestContent(m).length,0), 'every package contributes its own definitions');
});

test('inspectorSources carries no mod content at all when nothing is selected', () => {
  // The default has to be core by CONSTRUCTION, not by a filter somebody could forget to apply.
  const base = inspectorSources({ manifests: discoverMods().mods });
  assert.equal(base.scope, SCOPE.CORE);
  assert.equal(base.modId, null);
  assert.deepEqual(base.modEntries, []);

  const selected = inspectorSources({ modId: 'dragonball_tournament', manifests: discoverMods().mods });
  assert.equal(selected.scope, SCOPE.MOD);
  assert.ok(selected.modEntries.length > 0);
});

test('the resource registry tags every entry and the default view is core', async () => {
  // The end-to-end version: the data half of the Inspector really does hide mod content by default.
  const { registry, scopeView, scopeSummary } = await import('../src/resourceRegistry.js');
  const all = registry({ scope: 'all' });
  const core = registry();
  assert.equal(core.scope.scope, SCOPE.CORE, 'the default view is core');
  assert.equal(all.allEntries.size > 0, true);
  for (const entry of core.entries.values()) {
    assert.equal(entry.scope, SCOPE.CORE, `${entry.key} must be core in the default view`);
    assert.equal(entry.modId, null);
  }
  // Nothing ships as a mod entry yet, so the two views agree on size -- and the summary says so explicitly.
  const summary = scopeSummary(all);
  assert.equal(summary.mod, 0);
  assert.equal(summary.core, all.allEntries.size);

  // A mod entry injected the way a real one arrives is hidden by the default and shown when selected.
  const withMod = {
    ...all,
    allEntries: new Map([
      ...all.allEntries,
      ['minecraft:fake_mod_thing', { key: 'minecraft:fake_mod_thing', kind: 'item', scope: SCOPE.MOD, modId: 'fake_mod', blockId: null }],
    ]),
  };
  const modView = scopeView(withMod, { modId: 'fake_mod' });
  assert.equal(modView.entries.size, 1);
  assert.equal(modView.entries.has('minecraft:fake_mod_thing'), true);
  const coreView = scopeView(withMod, { scope: SCOPE.CORE });
  assert.equal(coreView.entries.has('minecraft:fake_mod_thing'), false, 'the mod entry is not in the core view');
  // And the full map is still reachable from a scoped view, so a cross-reference still resolves.
  assert.equal(coreView.allEntries.has('minecraft:fake_mod_thing'), true);
});
