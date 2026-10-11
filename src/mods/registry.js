// The content registry: every block, item, mob and mechanism, under a namespace.
//
// Modelled on Minecraft's own registries (https://docs.neoforged.net/docs/concepts/registries/), because the
// shape being copied is the one that solved this problem already:
//
//   * Every registered thing has a UNIQUE NAME of the form `namespace:path`. Vanilla's namespace is
//     `minecraft`; a mod's is its mod id. `minecraft:stone` and `dragonball_tournament:ki_block` cannot
//     collide, and neither can two mods.
//   * A registry is a map of names to singletons. There is one stone block, shown many times.
//   * Querying is by that name, and asking whether something exists is how a caller checks whether a mod is
//     installed -- which is why the answer is a lookup rather than a hardcoded list.
//
// The one addition to vanilla's model is SCOPING, which is what the Inspector needs: content is either CORE
// (ships with the game) or belongs to a mod, and the registry can hand back just one of those. Vanilla has no
// such concept because a vanilla registry only ever holds one mod's worth of content plus whatever is loaded.
//
// This module is deliberately free of Three.js and of the DOM, like `resourceRegistry.js`, so the whole of it
// is testable in milliseconds and the CLI and the page can both drive it.
import { readFileSync, existsSync } from 'node:fs';

/** Vanilla's namespace, and this game's: content that ships with the game itself. */
export const CORE_NAMESPACE = 'minecraft';

/** The scopes content can be in. */
export const SCOPE = Object.freeze({ CORE: 'core', MOD: 'mod' });

/** The kinds of thing a registry holds. Kept as a closed list so a typo cannot invent a new kind silently. */
export const KIND = Object.freeze({
  BLOCK: 'block',
  ITEM: 'item',
  MOB: 'mob',
  MECHANISM: 'mechanism',
  MAP: 'map',
  RECIPE: 'recipe',
  LOOT_TABLE: 'loot_table',
});

export const KINDS = Object.freeze(Object.values(KIND));

/** A namespaced name, as `namespace:path`. Split out because both halves are validated. */
export function splitName(name) {
  const text = String(name ?? '').trim();
  const at = text.indexOf(':');
  if (at < 0) return { namespace: CORE_NAMESPACE, path: normalisePath(text) };
  return { namespace: normaliseNamespace(text.slice(0, at)), path: normalisePath(text.slice(at + 1)) };
}

/** Join a namespace and a path. */
export function joinName(namespace, path) {
  return `${normaliseNamespace(namespace)}:${normalisePath(path)}`;
}

/** A namespace is a mod id: lower case, digits, underscores and hyphens. */
export function normaliseNamespace(namespace) {
  const text = String(namespace ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return text || CORE_NAMESPACE;
}

/** A path is the same alphabet, and cannot be empty. */
export function normalisePath(path) {
  return String(path ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/^:+|:+$/g, '');
}

/** True when a string is a well-formed namespaced name. */
export function isValidName(name) {
  const { namespace, path } = splitName(name);
  return /^[a-z0-9_]+$/.test(namespace) && /^[a-z0-9_./]+$/.test(path) && path.length > 0;
}

/**
 * The registry.
 *
 * One instance holds core content plus every loaded mod's, and every query can be narrowed to a scope. That
 * narrowing is the whole point: the game plays with everything loaded, and the Inspector looks at one scope
 * at a time.
 */
export class ContentRegistry {
  constructor() {
    /** `kind` -> Map(fullName -> entry). Split by kind so a block and an item may share a name, as in
     * vanilla, where `minecraft:stone` is in both the block and the item registry. */
    this.byKind = new Map();
    /** fullName -> Set(kind), for "what is this name?" and for orphan reporting. */
    this.kindsByName = new Map();
    /** Every namespaced name that belongs to a mod, and which mod. */
    this.owners = new Map();
  }

  /**
   * Register one thing.
   *
   * @param {object} entry
   * @param {string} entry.kind       one of KIND
   * @param {string} entry.name       `namespace:path`, or a bare path for core content
   * @param {object} [entry.data]     whatever the kind's readers need
   * @param {string} [entry.modId]    the owning mod; absence means core
   * @returns {{ok: boolean, name: string, reason?: string}}
   */
  register({ kind, name, data = null, modId = null } = {}) {
    if (!KINDS.includes(kind)) return { ok: false, name: String(name), reason: `unknown kind '${kind}'` };
    const text = String(name ?? '').trim();
    const explicitNamespace = text.includes(':');
    const { namespace, path } = splitName(text);
    if (!isValidName(`${namespace}:${path}`)) {
      return { ok: false, name: String(name), reason: `'${name}' is not a valid namespaced name` };
    }

    // A mod may not register into the core namespace: that is the one rule that keeps it from shadowing the
    // game's own content. Checked on the WRITTEN name, before anything is normalised away, so
    // `minecraft:stone` from a mod is refused even though a bare `stone` would be given the mod's namespace.
    if (modId && explicitNamespace && namespace === CORE_NAMESPACE) {
      return { ok: false, name: `${namespace}:${path}`, reason: 'a mod may not register into the core namespace' };
    }

    // The namespace is the MOD'S when a mod is registering, whatever it wrote -- a bare `ki_block` from a mod
    // is `that_mod:ki_block`, not `minecraft:ki_block`.
    //
    // This was wrong first time round: the line read `joinName(modId ? namespace : CORE_NAMESPACE, path)`,
    // which used the namespace parsed out of the name. A bare path parses as `minecraft`, so every mod's
    // content was landing in the CORE namespace -- silently, and past the check above because the mod never
    // wrote `minecraft:` explicitly. The scoping tests caught it; a game would have caught it as two mods
    // fighting over the same ids.
    const owner = modId ? normaliseNamespace(modId) : CORE_NAMESPACE;
    const full = joinName(owner, path);

    if (!this.byKind.has(kind)) this.byKind.set(kind, new Map());
    const bucket = this.byKind.get(kind);
    if (bucket.has(full)) {
      return { ok: false, name: full, reason: `${full} is already registered as a ${kind}` };
    }

    const isCore = owner === CORE_NAMESPACE;
    const entry = Object.freeze({
      kind, name: full, namespace: owner, path, data,
      modId: isCore ? null : owner,
      scope: isCore ? SCOPE.CORE : SCOPE.MOD,
    });
    bucket.set(full, entry);
    if (!this.kindsByName.has(full)) this.kindsByName.set(full, new Set());
    this.kindsByName.get(full).add(kind);
    if (entry.modId) this.owners.set(full, entry.modId);
    return { ok: true, name: full };
  }

  /** Register many at once, reporting the failures rather than throwing on the first. */
  registerAll(entries, options = {}) {
    const accepted = [];
    const rejected = [];
    for (const entry of entries ?? []) {
      const result = this.register({ ...entry, ...options, kind: entry.kind ?? options.kind });
      if (result.ok) accepted.push(result.name);
      else rejected.push(result);
    }
    return { accepted, rejected };
  }

  /** One entry, or null. */
  get(kind, name) {
    const { namespace, path } = splitName(name);
    return this.byKind.get(kind)?.get(joinName(namespace, path)) ?? null;
  }

  /** True when something of that kind is registered under that name. */
  has(kind, name) {
    return this.get(kind, name) !== null;
  }

  /** Every kind a name is registered under, which is how a block item form is discovered. */
  kindsOf(name) {
    const { namespace, path } = splitName(name);
    return [...(this.kindsByName.get(joinName(namespace, path)) ?? [])];
  }

  /**
   * The entries of one kind, narrowed by scope.
   *
   * `scope` is `SCOPE.CORE`, `SCOPE.MOD`, a mod id, or null for everything. This is the query the Inspector
   * uses, and the default is core so that a caller who does not think about it gets the game's own content.
   */
  entries(kind, { scope = SCOPE.CORE, modId = null } = {}) {
    const bucket = this.byKind.get(kind);
    if (!bucket) return [];
    let list = [...bucket.values()];
    if (modId) list = list.filter(e => e.modId === normaliseNamespace(modId));
    else if (scope === SCOPE.CORE) list = list.filter(e => e.scope === SCOPE.CORE);
    else if (scope === SCOPE.MOD) list = list.filter(e => e.scope === SCOPE.MOD);
    return list;
  }

  /** The names of a kind, narrowed the same way. */
  names(kind, options) {
    return this.entries(kind, options).map(e => e.name);
  }

  /** Every mod id that has content registered. */
  modIds() {
    return [...new Set(this.owners.values())].sort();
  }

  /** How many entries of each kind, by scope. For a report. */
  summary() {
    const out = { core: {}, mod: {} };
    for (const [kind, bucket] of this.byKind) {
      for (const entry of bucket.values()) {
        const scope = entry.scope === SCOPE.CORE ? 'core' : 'mod';
        out[scope][kind] = (out[scope][kind] ?? 0) + 1;
      }
    }
    return out;
  }

  /** Remove everything a mod registered. Used when its world is closed. */
  unregisterMod(modId) {
    const owner = normaliseNamespace(modId);
    let removed = 0;
    for (const [kind, bucket] of this.byKind) {
      for (const [name, entry] of [...bucket]) {
        if (entry.modId !== owner) continue;
        bucket.delete(name);
        this.kindsByName.get(name)?.delete(kind);
        if (this.kindsByName.get(name)?.size === 0) this.kindsByName.delete(name);
        this.owners.delete(name);
        removed++;
      }
    }
    return removed;
  }

  /** Empty the registry. For a test, or a full reload. */
  clear() {
    this.byKind.clear();
    this.kindsByName.clear();
    this.owners.clear();
  }
}

/**
 * Validate and normalise a manifest object.
 *
 * Shared by the two ways a manifest arrives: read from `mod.json` on disk (the CLI and the tests) and imported
 * as data by the bundler (the browser). One validator, so the two cannot disagree about what a legal manifest
 * is -- which is the failure that would let a mod work in one environment and not the other.
 */
export function normaliseManifest(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'a manifest must be an object' };
  const problems = [];
  if (!raw.id) problems.push('id is required');
  else if (!/^[a-z0-9_]+$/.test(normaliseNamespace(raw.id))) problems.push(`id '${raw.id}' must be lower case letters, digits and underscores`);
  if (!raw.name) problems.push('name is required');
  if (normaliseNamespace(raw.id) === CORE_NAMESPACE) problems.push('a mod may not use the core namespace');
  if (raw.provides && typeof raw.provides !== 'object') problems.push('provides must be an object');
  if (problems.length) return { ok: false, reason: problems.join('; ') };

  return {
    ok: true,
    manifest: Object.freeze({
      id: normaliseNamespace(raw.id),
      name: String(raw.name),
      version: String(raw.version ?? '0.0.0'),
      description: String(raw.description ?? ''),
      /** The world mechanism this mod supplies, if any. */
      mechanism: raw.mechanism ? String(raw.mechanism) : null,
      /** The designed-world maps this mod owns. */
      maps: Array.isArray(raw.maps) ? raw.maps.map(String) : [],
      /** What it says it registers, for the Inspector and for a report rather than for enforcement. */
      provides: raw.provides ?? {},
      /** The module that exports `register(api)`, relative to the mod directory. */
      entrypoint: String(raw.entrypoint ?? './index.js'),
    }),
  };
}

/** Load and validate a mod manifest from a `mod.json` on disk. */
export function readModManifest(path) {
  if (!existsSync(path)) return { ok: false, reason: `${path} does not exist` };
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return { ok: false, reason: `${path} is not valid JSON: ${error.message}` };
  }
  return normaliseManifest(raw);
}
