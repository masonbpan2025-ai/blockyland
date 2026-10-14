// The bridge between the mod table and the Inspector.
//
// The Inspector's job here is to answer one question correctly: WHICH content may I show right now? The answer
// is core content unless a designed world has been selected, and that world's content once it has. This module
// is the single place that decides, so the block/item Inspector and the mob Inspector cannot disagree.
//
// The content comes from the MANIFEST, not from importing the mod. That is deliberate and it is the same
// reason `fabric.mod.json` exists: metadata about a mod has to be readable without loading its code, or the
// Inspector would have to run the game to list what a world contains -- and would drag Three.js into a CLI
// check that is supposed to cost milliseconds.
import { KIND, SCOPE, joinName, normaliseNamespace } from './registry.js';
import { BUILTIN_MODS, discoverMods } from './loader.js';

/** Every mod manifest this build ships, read from disk. */
export function allManifests(options = {}) {
  return discoverMods(options).mods;
}

/**
 * The content a manifest declares, as registry-shaped entries.
 *
 * `provides` is a list per kind, each entry either a bare id string or an object with an `id` and whatever
 * else the manifest wants to say. A bare string is accepted because a manifest that only wants to claim a
 * name should not have to write `{ "id": ... }`.
 */
export function manifestContent(manifest, kind = null) {
  const out = [];
  const provides = manifest?.provides ?? {};
  const namespaces = { mobs: KIND.MOB, blocks: KIND.BLOCK, items: KIND.ITEM, maps: KIND.MAP };
  for (const [key, list] of Object.entries(provides)) {
    const entryKind = namespaces[key];
    if (!entryKind) continue;
    if (kind && entryKind !== kind) continue;
    for (const raw of Array.isArray(list) ? list : []) {
      const id = typeof raw === 'string' ? raw : raw?.id;
      if (!id) continue;
      const data = typeof raw === 'string' ? { name: raw } : raw;
      out.push({
        kind: entryKind,
        name: joinName(manifest.id, id),
        path: id,
        modId: normaliseNamespace(manifest.id),
        data,
      });
    }
  }
  return out;
}

/** Every mod's declared content, flattened. */
export function allModContent(manifests, kind = null) {
  return manifests.flatMap(m => manifestContent(m, kind));
}

/**
 * What the Inspector should show.
 *
 * `modId` is three-state, deliberately:
 *   * omitted / `undefined` -- base game, even while a mod world is open;
 *   * `null`                -- force the base game, which is how a "browse core content" button works while a
 *                              designed world is still open;
 *   * a string              -- force that mod, which is how a player inspects a world they have not opened.
 *
 * The first version used `modId ?? loader?.activeModId`, so an explicit `null` was indistinguishable from "not
 * given" and there was no way to ask for core while a world was open.
 *
 * @param {object} options
 * @param {object|null} [options.loader]      optional loader context; does not select Inspector content
 * @param {string|null} [options.modId]       an explicit selection; see the three states above
 * @param {object[]} [options.manifests]      the mod table; discovered from disk when absent
 * @returns {{scope: string, modId: string|null, label: string, entries: object[]}}
 */
export function inspectorScope(options = {}) {
  const { manifests = null } = options;
  const mods = manifests ?? allManifests();
  const selected = Object.prototype.hasOwnProperty.call(options, 'modId')
    ? options.modId
    : null;

  if (!selected) {
    // The default, and the point of the whole arrangement: core content only.
    return {
      scope: SCOPE.CORE,
      modId: null,
      label: 'Base game',
      entries: [],
      availableMods: mods.map(m => ({ id: m.id, name: m.name })),
    };
  }

  const manifest = mods.find(m => m.id === normaliseNamespace(selected));
  if (!manifest) {
    return {
      scope: SCOPE.CORE, modId: null, label: 'Base game', entries: [],
      availableMods: mods.map(m => ({ id: m.id, name: m.name })),
      unknownMod: selected,
    };
  }
  return {
    scope: SCOPE.MOD,
    modId: manifest.id,
    label: manifest.name,
    entries: manifestContent(manifest),
    manifest,
    availableMods: mods.map(m => ({ id: m.id, name: m.name })),
  };
}

/**
 * The `sources` an Inspector build needs to show one scope.
 *
 * Spread into `registry(...)`: `registry({ fresh: true, ...inspectorSources({ modId }) })`. Without a modId the
 * sources carry no mod content at all, so the default build is core by construction rather than by a filter
 * that could be forgotten.
 */
export function inspectorSources({ loader = null, modId = null, manifests = null, mods = BUILTIN_MODS } = {}) {
  const scope = inspectorScope({ loader, modId, manifests: manifests ?? allManifests({ mods }) });
  return {
    scope: scope.scope,
    modId: scope.modId,
    modEntries: scope.entries,
    scopeLabel: scope.label,
  };
}
