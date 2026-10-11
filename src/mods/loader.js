// The mod loader: discovery, manifests, entrypoints.
//
// The rule this enforces is the one that makes the structure worth having: **the core never imports a mod.**
// A mod's code is reached only through its entrypoint, called by this loader, so deleting a mod's directory
// leaves the game working and the core's import graph unchanged.
//
// That is Fabric's arrangement (https://docs.fabricmc.net/develop/getting-started/project-structure): a
// `fabric.mod.json` names an `id` and an entrypoint, and the loader -- not the game -- calls
// `onInitialize()`. NeoForge's registries page makes the reason explicit: "Mods are not automatically
// classloaded by Minecraft, and thus workarounds are needed." Here the workaround is that the loader holds a
// table of manifests and imports an entrypoint by path, at the moment a world needs it.
//
// Two lifetimes, matching vanilla's two kinds of registry:
//
//   * GAME-SCOPE content is registered when the mod is loaded and stays. Blocks, items, mobs.
//   * WORLD-SCOPE content is registered when a designed world is OPENED and withdrawn when it is left. This
//     is the datapack-registry idea: "a special kind of registry that loads data from datapack JSONs at world
//     load, instead of loading them when the game starts."
//
// The Inspector reads through the same scope, which is why it can default to core and then show one world's
// content once that world is selected.
//
// Free of Three.js and of the DOM; `import()` is the only I/O, and a test passes its own `importModule`.
import { join } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import {
  CORE_NAMESPACE, KIND, SCOPE,
  ContentRegistry, normaliseManifest, readModManifest,
} from './registry.js';
// The manifest as DATA, so the browser needs no filesystem. Imported statically rather than read at runtime:
// a browser build has no `readFileSync`, and the first version of this file called `discoverMods()`, which
// reads manifests from disk -- so the game would have thrown while constructing its own mod loader.
import dragonballTournamentManifest from './dragonball-tournament/mod.json' with { type: 'json' };

/** Where mods live. One directory per mod, each with a `mod.json`. */
export const MODS_DIRECTORY = 'src/mods';

/** The manifest every mod directory must contain. */
export const MANIFEST_FILE = 'mod.json';

/**
 * Every mod this build ships.
 *
 * A table rather than a directory scan at runtime, because the browser build has no filesystem. Each entry
 * carries three things:
 *
 *   * `manifestPath`, so the CLI and the tests can read the same manifest from disk and check the two agree;
 *   * `manifest`, the data itself, so the browser needs no file access;
 *   * `load()`, a STATIC `import()` of the entrypoint. A literal specifier is what lets the bundler include
 *     the mod; a variable one with `@vite-ignore` is left out of the bundle and fails only at runtime, in the
 *     browser, which is the worst place to find out.
 *
 * This is what a mod loader's mod list is. The loader reads it; the game does not.
 */
export const BUILTIN_MODS = Object.freeze([
  Object.freeze({
    id: 'dragonball_tournament',
    manifestPath: `${MODS_DIRECTORY}/dragonball-tournament/${MANIFEST_FILE}`,
    manifest: dragonballTournamentManifest,
    load: () => import('./dragonball-tournament/index.js'),
  }),
]);

/**
 * Read every built-in mod's manifest.
 *
 * Prefers the INLINE manifest, which is what the browser uses. When `fromDisk` is passed, the manifest is read
 * from `manifestPath` instead -- that is the CLI and test path, and the two are asserted to agree.
 */
export function discoverMods({ mods = BUILTIN_MODS, readManifest = readModManifest, fromDisk = false } = {}) {
  const found = [];
  const rejected = [];
  for (const entry of mods) {
    let raw = entry.manifest ?? null;
    if (fromDisk || !raw) {
      const result = readManifest(entry.manifestPath);
      if (!result.ok) {
        rejected.push({ id: entry.id, reason: result.reason });
        continue;
      }
      raw = result.manifest;
    } else {
      const normalised = normaliseManifest(raw);
      if (!normalised.ok) {
        rejected.push({ id: entry.id, reason: normalised.reason });
        continue;
      }
      raw = normalised.manifest;
    }
    found.push({
      ...raw,
      manifestPath: entry.manifestPath,
      directory: entry.manifestPath.replace(/\/[^/]+$/, ''),
      load: entry.load ?? null,
    });
  }
  return { mods: found, rejected };
}

/** The mod whose manifest claims this map file, or null. */
export function modForMap(mods, mapFilename) {
  const wanted = String(mapFilename ?? '').toLowerCase();
  if (!wanted) return null;
  return mods.find(m => m.maps.some(f => f.toLowerCase() === wanted)) ?? null;
}

/** The mod that supplies a world mechanism, or null. */
export function modForMechanism(mods, mechanismId) {
  if (!mechanismId) return null;
  return mods.find(m => m.mechanism === mechanismId) ?? null;
}

/**
 * The API a mod's entrypoint is handed.
 *
 * Everything a mod may do goes through this object, which is what keeps the coupling one-directional: the mod
 * knows the game, and the game knows only that some mod asked to register something.
 */
export class ModApi {
  constructor({ registry, loader, game = null, modId, log = () => {} }) {
    this.registry = registry;
    this.loader = loader;
    this.game = game;
    this.modId = modId;
    this.log = log;
    /** What this mod registered, so it can be withdrawn without affecting anyone else. */
    this.registered = [];
  }

  /** Register one thing into the mod's own namespace. A mod supplies the path, never the namespace. */
  register(kind, path, data = null) {
    const result = this.registry.register({ kind, name: `${this.modId}:${path}`, data, modId: this.modId });
    if (!result.ok) {
      this.log(`  ${this.modId}: ${result.reason}`);
      return null;
    }
    this.registered.push({ kind, name: result.name });
    return result.name;
  }

  registerBlock(path, data) { return this.register(KIND.BLOCK, path, data); }
  registerItem(path, data) { return this.register(KIND.ITEM, path, data); }
  registerMob(path, data) { return this.register(KIND.MOB, path, data); }
  registerMap(path, data) { return this.register(KIND.MAP, path, data); }

  /**
   * A world mechanism.
   *
   * Lands in the CORE's `WorldMechanismManager` when the game is present, so there is one mechanism registry
   * and `setMechanism` finds a mod's mechanism the same way it finds the core's. The loader keeps its own map
   * only as the fallback for a game-less load, which is what a test uses.
   */
  registerMechanism(id, def) {
    const manager = this.game?.mechanisms;
    if (manager?.registerMechanism) manager.registerMechanism(id, def);
    else this.loader.mechanisms.set(id, def);
    this.registered.push({ kind: KIND.MECHANISM, name: id });
    return id;
  }

  /**
   * Register a hook the core runs when a mod's world is left.
   *
   * This is how a mod cleans up after itself without the core naming any of its subsystems: the mod hands
   * over a function, and `default`'s activate calls every function it was given.
   */
  onLeaveWorld(cleanup) {
    const manager = this.game?.mechanisms;
    if (manager?.registerWorldCleanup) {
      manager.registerWorldCleanup(cleanup);
      this.registered.push({ kind: 'world_cleanup', name: this.modId });
      return true;
    }
    return false;
  }

  /**
   * Put a manager on the game under the name the core already uses.
   *
   * This is how a mod adds a subsystem without the core importing it: the core's field is populated here, and
   * the core guards its own uses with `?.` so an unloaded mod is simply an absent field.
   */
  attach(name, value) {
    if (!this.game) return false;
    this.game[name] = value;
    this.registered.push({ kind: 'attachment', name });
    return true;
  }

  /** True when a name is registered by ANY loaded mod or by core -- how a mod checks for another mod. */
  exists(kind, name) {
    return this.registry.has(kind, name);
  }
}

/**
 * Which mechanism a world should run, decided from the MOD TABLE rather than from a name written in the core.
 *
 * `mapManager.js` used to answer this with `mapData.mechanism || (isTournament ? 'dragonball_tournament' :
 * 'default')`, which is the core naming a designed world in three places. It now asks here, and the answer
 * comes from the manifests: an explicit `mechanism` on the map wins, otherwise the map's own filename decides
 * which mod owns it, and a map no mod claims is `default`.
 *
 * @returns {{mechanismId: string, modId: string|null, manifest: object|null}}
 */
export function resolveWorldMechanism(loader, mapData = {}) {
  const mods = loader?.available ?? [];
  if (mapData.mechanism) {
    const manifest = modForMechanism(mods, mapData.mechanism);
    return { mechanismId: mapData.mechanism, modId: manifest?.id ?? null, manifest };
  }
  const manifest = modForMap(mods, mapData.filename ?? mapData.name);
  if (manifest) {
    return { mechanismId: manifest.mechanism ?? 'default', modId: manifest.id, manifest };
  }
  return { mechanismId: 'default', modId: null, manifest: null };
}

/**
 * The loader.
 *
 * Holds the mod table, loads and unloads mods, and answers the questions the core asks: which mechanism does
 * this world want, and which mod owns this content.
 */
export class ModLoader {
  /**
   * @param {object} options
   * @param {ContentRegistry} [options.registry]
   * @param {(path: string) => Promise<object>} [options.importModule]  injected so a test needs no filesystem
   * @param {() => void} [options.log]
   */
  constructor({ registry = new ContentRegistry(), importModule = null, log = () => {}, mods = null } = {}) {
    this.registry = registry;
    this.importModule = importModule;
    this.log = log;
    /** Every mechanism registered by any loaded mod, plus the core's. */
    this.mechanisms = new Map();
    /** modId -> { manifest, api, status, error } */
    this.mods = new Map();
    /** The mods this build knows about, discovered from disk unless one is supplied. */
    this.available = mods ?? discoverMods().mods;
    /** The mod whose world is currently open, if any. */
    this.activeModId = null;
    for (const manifest of this.available) {
      this.mods.set(manifest.id, { manifest, api: null, status: 'available', error: null, entrypoint: null });
    }
  }

  /** The mods, as manifests. */
  list() {
    return [...this.mods.values()].map(m => ({ ...m.manifest, status: m.status, error: m.error }));
  }

  /** One mod's record. */
  get(modId) {
    return this.mods.get(String(modId ?? '').toLowerCase().replace(/[\s-]+/g, '_')) ?? null;
  }

  /** True when a mod has been loaded. */
  isLoaded(modId) {
    return this.get(modId)?.status === 'loaded';
  }

  /**
   * Load one mod: import its entrypoint and let it register.
   *
   * `importModule` may be synchronous or async; both are awaited, so a browser dynamic import and a test's
   * plain function behave the same.
   */
  async load(modId, { game = null } = {}) {
    const record = this.get(modId);
    if (!record) return { ok: false, reason: `no mod '${modId}'` };
    if (record.status === 'loaded') return { ok: true, already: true };

    const { manifest } = record;
    const specifier = `${manifest.directory ?? `${MODS_DIRECTORY}/${manifest.id}`}/${manifest.entrypoint.replace(/^\.\//, '')}`;
    let module;
    try {
      if (this.importModule) {
        // A test's own loader, which needs no filesystem and no bundler.
        module = await this.importModule(specifier, manifest);
      } else if (typeof manifest.load === 'function') {
        // The real path: a STATIC `import()` recorded in the mod table, which is what lets the bundler include
        // the mod. Deliberately not a variable specifier -- see `BUILTIN_MODS` for why that matters.
        module = await manifest.load();
      } else {
        // Last resort for a manifest that arrived without a loader, such as one from a directory scan. A
        // bundler cannot follow this, so it is the path the CLI takes and the browser does not.
        module = await import(/* @vite-ignore */ specifier);
      }
    } catch (error) {
      record.status = 'failed';
      record.error = `entrypoint '${specifier}' could not be imported: ${error.message}`;
      this.log(`  ${manifest.id}: ${record.error}`);
      return { ok: false, reason: record.error };
    }
    if (typeof module?.register !== 'function') {
      record.status = 'failed';
      record.error = `entrypoint '${specifier}' must export a register(api) function`;
      this.log(`  ${manifest.id}: ${record.error}`);
      return { ok: false, reason: record.error };
    }

    const api = new ModApi({ registry: this.registry, loader: this, game, modId: manifest.id, log: this.log });
    try {
      await module.register(api, { game, manifest, registry: this.registry });
    } catch (error) {
      record.status = 'failed';
      record.error = `register(api) threw: ${error.message}`;
      this.log(`  ${manifest.id}: ${record.error}`);
      return { ok: false, reason: record.error };
    }

    record.api = api;
    record.entrypoint = module;
    record.status = 'loaded';
    record.error = null;
    this.log(`  mod loaded: ${manifest.name} (${manifest.id}) -- ${api.registered.length} registration(s)`);
    return { ok: true, registered: api.registered };
  }

  /**
   * Withdraw one mod.
   *
   * The mechanism goes, the content goes, and any field the mod attached to the game is deleted -- so the
   * core's `game.tournament` genuinely stops existing rather than lingering as a stale object.
   */
  unload(modId) {
    const record = this.get(modId);
    if (!record || record.status !== 'loaded') return { ok: false, reason: 'not loaded' };
    for (const { kind, name } of record.api?.registered ?? []) {
      if (kind === KIND.MECHANISM) this.mechanisms.delete(name);
    }
    for (const { kind, name } of record.api?.registered ?? []) {
      if (kind === 'attachment') {
        const game = record.api.game;
        if (game && Object.prototype.hasOwnProperty.call(game, name)) delete game[name];
      }
    }
    const removed = this.registry.unregisterMod(record.manifest.id);
    record.api = null;
    record.entrypoint = null;
    record.status = 'available';
    if (this.activeModId === record.manifest.id) this.activeModId = null;
    return { ok: true, removed };
  }

  /**
   * Prepare a designed world: load the mod that owns this map, and remember it as active.
   *
   * This is the "datapack registry" half -- the world's content arrives with the world.
   */
  async openWorld(mapData, { game = null } = {}) {
    const filename = mapData?.filename ?? mapData?.name ?? null;
    const manifest = modForMap(this.available, filename)
      ?? modForMechanism(this.available, mapData?.mechanism);
    if (!manifest) {
      // A plain world: whatever mod was open is closed, and core content is all there is.
      this.closeWorld();
      return { ok: true, mod: null };
    }
    const result = await this.load(manifest.id, { game });
    if (result.ok) this.activeModId = manifest.id;
    return { ...result, mod: manifest };
  }

  /** Close the open world's mod, if any. */
  closeWorld() {
    if (this.activeModId) this.unload(this.activeModId);
    this.activeModId = null;
    return { ok: true };
  }

  /**
   * The scope the Inspector should be looking at.
   *
   * `core` unless a designed world is open, and then that mod's id. The default is the whole point of the
   * request: an Inspector that has not been told otherwise shows the game's own content and nothing else.
   */
  inspectorScope() {
    return this.activeModId ? { scope: SCOPE.MOD, modId: this.activeModId } : { scope: SCOPE.CORE, modId: null };
  }

  /** Which mod owns a piece of content, or 'minecraft' for core. `kind` may be omitted to ask any kind. */
  ownerOf(name, kind = null) {
    const kinds = kind ? [kind] : this.registry.kindsOf(name);
    for (const k of kinds) {
      const entry = this.registry.get(k, name);
      if (entry) return entry.modId ?? CORE_NAMESPACE;
    }
    return null;
  }

  /** A report of what is loaded, for a CLI or a chat line. */
  report() {
    return {
      activeMod: this.activeModId,
      inspectorScope: this.inspectorScope(),
      mods: this.list().map(m => ({ id: m.id, name: m.name, mechanism: m.mechanism, status: m.status })),
      mechanisms: [...this.mechanisms.keys()],
      content: this.registry.summary(),
    };
  }
}

/**
 * The built-in mod table read from disk, for the cases that need it eagerly.
 *
 * `discoverMods` is the real call; this exists so the CLI and a test can share one line.
 */
export function loadModTable({ directory = MODS_DIRECTORY } = {}) {
  if (!existsSync(directory)) return { mods: [], rejected: [] };
  const entries = readdirSync(directory, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => ({ id: d.name.replace(/-/g, '_'), manifestPath: `${directory}/${d.name}/${MANIFEST_FILE}` }));
  return discoverMods({ mods: entries });
}
