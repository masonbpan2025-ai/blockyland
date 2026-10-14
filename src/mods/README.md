# Designed-world mods

Start with the current [system design](../../docs/mod-system.md), [API reference](../../docs/mod-api.md),
and [authoring guide](../../docs/creating-mods.md). Rescue Adventure is the authoritative game reference.


A designed world owns its map, content, rules and UI in one directory. The base game provides rendering,
physics, inventory and loader APIs. Mod entrypoints load on demand; core game modules never import a
world implementation. The browser generated catalog is the integration point for shipped mods.

## Research and conventions

This architecture applies patterns from two established open source ecosystems:

- [Fabric project structure](https://docs.fabricmc.net/develop/getting-started/project-structure): a manifest,
  an entrypoint and mod-owned assets and data.
- [Fabric registries](https://wiki.fabricmc.net/tutorial:registry): identity is `namespace:path`; mods own
  their namespaces, and different content kinds have separate registries.
- [Luanti mods](https://api.luanti.org/mods/): one directory per mod, a loader-controlled entrypoint,
  dependencies declared as metadata, and mod-prefixed content names.

These patterns are adapted to a browser game with a selected-world lifetime. This is an extension boundary
for trusted bundled JavaScript, not a security sandbox for arbitrary downloaded code.

## Layout and responsibilities

`src/mods/dragonball-tournament/` contains the manifest, entrypoint, `maps/`, mob models and procedural
textures (`mobs.js`), sounds (`audio.js`), arena fireworks (`fireworks.js`), world policies (`runtime.js`),
HUD/modal markup (`ui.js`), styling (`style.css`), tournament, training sites, Ki skills and dungeon combat.
The map generator is also part of the mod directory.

Shared infrastructure lives directly under `src/mods`: `registry.js`, `loader.js`, `paths.js`,
`manifestFile.js` (Node-only filesystem discovery), `inspectorScope.js` and `inspectorSelector.js`.
Filesystem discovery does not import the browser catalog or executable mod code.

## Registration and lifetime

`ModApi.registerMob`, `registerBlock`, `registerItem` and `registerMap` register owned metadata.
`registerMobProvider(path, {spawn, dimensions, update, hurt, interact})` supplies executable mob behavior.
Providers are stored only under namespaced identities. Bare types in old map files resolve against the
manager's active mod namespace; no global alias is installed. Spawned entities carry `contentId` and
`modId`, while `type` preserves compatibility with saved maps and species behavior.

`extend(target, fields)` changes an instance and records its original property descriptors for restoration.
`attach(name, manager)` uses the same lifetime mechanism for game subsystems. Never modify shared
prototypes. Register cleanup with `onDispose`; DOM listeners use abort signals. Closing a mod removes its
registry content, mechanism, providers, live mobs, textures, DOM, listeners and player callbacks. Failed
registration uses the same rollback path. Opening a different world closes the previous world's mod first.

The core calls generic `game.modRuntime` hooks and mob providers rather than naming tournament managers.
Shared player locomotion and animation remain engine facilities that world rules can use.

## Inspector contract

Mob, Resource (blocks/items), and Structure Inspectors have a **World / mod** dropdown. Each opens on
**Base game** unless its URL explicitly selects a valid `mod`. A mob/resource query alone cannot select a
mod. Inspector selection is independent of the active gameplay world.

- Base game lists only engine content.
- Selecting a mod lists only that mod's declared content of the requested kind.
- An unknown mod falls back to the base game.
- A mod with no entries of that kind shows an empty list and clears previous previews and details.
- Resource views retain `allEntries` for cross-reference resolution; `entries` controls visibility.
  Mob/map declarations cannot be coerced into item entries.

The tournament currently declares three mobs and its map. It adds no blocks, items or registry structures,
so its Resource and Structure Inspector selections are intentionally empty.

## Authored terrain and loading

Designed maps use `world.generationMode = 'authored'`: missing chunks contain air, and neither biome
generation nor natural mob population runs in them. Streaming releases distant geometry while retaining
authored voxel data, so returning to an arena cannot replace it with procedural terrain. Generated worlds
restore their procedural (or flat) generation mode; saves carry this setting.

Map replacement pauses simulation before awaiting mod loading, resets pending streaming and mesh work,
and publishes `ready` only after terrain, entities, mechanisms and controls are restored. This also prevents
collision lookups from caching generated chunks while authored chunks are still being decoded.

With a dev server on port 3100, `node scripts/test-tournament-world.mjs` compares every authored voxel after
loading and streaming, checks player movement, and switches back to a generated world.

## Adding a bundled world

1. Create a directory with `mod.json`, `manifest.js`, `index.js`, and its maps/assets/code.
2. Declare every Inspector-visible contribution under `provides`; keep manifest copies equivalent.
3. Add one catalog entry to `BUILTIN_MODS`, including its lazy entrypoint and map URLs.
4. Register code through `ModApi`, and record side effects for disposal.
5. Verify base-game and mod visibility, unload/reload and failed-load rollback.

The dev map API discovers mod directories from manifests. Production map URLs are emitted by Vite from
catalog `new URL(..., import.meta.url)` references. `designed_worlds` remains an optional import location
for old user-authored maps; the shipped tournament map lives in its mod directory.

Run scope/lifecycle tests with `node --test --test-isolation=none tests/modInspectorIsolation.test.js
tests/modStructure.test.js`. With a dev server at port 3100, run `node scripts/test-mod-inspectors.mjs` for
browser checks (installed Edge by default; `MOD_BROWSER_CHANNEL` and `MOD_INSPECTOR_URL` override defaults).
