# Mods

A **designed world** is a mod. It lives in one directory under `src/mods/`, with a manifest and an entrypoint,
and it contains its own content and its own game logic. The core does not import it.

The structure is taken from the two reference mod loaders, because the problem and the answer are the same:

* [Fabric's project structure](https://docs.fabricmc.net/develop/getting-started/project-structure) — a
  `fabric.mod.json` naming an `id` and an `entrypoints`, and a loader that calls them. "Mods are not
  automatically classloaded by Minecraft, and thus workarounds are needed."
* [NeoForge's registries](https://docs.neoforged.net/docs/concepts/registries/) — every registered object has a
  unique `namespace:path` name, vanilla's namespace is `minecraft`, and a registry is a map of those names to
  singletons.

## Why this exists

Before, one designed world was spread through the core: `worldMechanisms.js` registered its mechanism by name,
`mapManager.js` compared against `'dragonball_tournament'` in six places, `main.js` imported its four managers
and named its fields in a dozen more, and two of its mobs were wired into eight switches inside `mobs.js`.

That worked, and it meant the core could not be read, built or reasoned about without one particular world —
and a second world would have edited every one of those files.

## The layout

```
src/mods/
  registry.js          the content registry (core infrastructure)
  loader.js            discovery, manifests, entrypoints (core infrastructure)
  inspectorScope.js    which content the Inspector may show (core infrastructure)
  README.md
  dragonball-tournament/
    mod.json           the manifest
    index.js           the entrypoint: export function register(api)
    tournament.js      the world's own modules
    dragonballSkills.js
    trainingSites.js
    dungeonMode.js
```

A mod's directory is self-contained. Its modules may import `three` and each other, and nothing else — a test
asserts that.

## Writing one

**1. `mod.json`**

```json
{
  "id": "my_world",
  "name": "My Designed World",
  "version": "1.0.0",
  "entrypoint": "./index.js",
  "mechanism": "my_world",
  "maps": ["My_World_Map.json"],
  "provides": {
    "mobs": [{ "id": "my_mob", "name": "My Mob" }]
  }
}
```

`id` is the mod's namespace. `maps` is what makes a map file open *this* mod — the core asks the mod table
which world owns a map rather than comparing filenames. `provides` is what the Inspector reads, so a mod's
content can be listed **without importing its code**; that is the same reason `fabric.mod.json` exists.

**2. `index.js`**

```js
export function register(api, { game }) {
  api.registerMob('my_mob', { name: 'My Mob', health: 20 });
  api.registerMechanism('my_world', { id: 'my_world', features: { allowDodgeRoll: true } });
  api.onLeaveWorld((g) => g.myWorld?.cleanup?.());
  if (game) api.attach('myWorld', new MyWorldManager(game));
}
```

**3. Add it to the table.** `BUILTIN_MODS` in `loader.js`. A test asserts that table and the directories on
disk agree, so a mod that is present but unlisted fails rather than silently never loading.

## The rules the registry enforces

* Ids are `namespace:path`. Core content is `minecraft:`; a mod's content is `<mod_id>:`.
* **A mod may not register into the core namespace.** That is what stops a mod shadowing the game's own
  content.
* A block and an item may share a name — vanilla's `minecraft:stone` is in both registries — so they are
  separate maps.
* The same name twice, in the same kind, is refused with a reason rather than silently replacing.
* Unloading a mod withdraws its content, its mechanism, and any field it attached to the game.

## The Inspector

Content is tagged `core` or `mod`, and a view is narrowed to one scope. **The default is core**, which is the
point: an Inspector that has not been told which world is open shows the game's own blocks and items, so a
designed world's content cannot be mistaken for vanilla's.

The scope is three-state:

| `modId` | shows |
| --- | --- |
| omitted | whatever world is open |
| `null` | the base game, even while a world is open |
| a string | that mod |

A scoped view keeps the full entry map on `allEntries`, so a cross-reference to content outside the view still
resolves — checking a mod's recipe against a core ingredient needs both.

## What is not finished

**The designed world's mobs are still implemented in the core's `mobs.js`.**

`tournament_host` and `jackie_chun` are *declared* by the manifest and *registered* as namespaced content, so
the Inspector attributes and scopes them correctly. But their factories, textures, hitboxes, AI and XP hooks
are still six branches inside the shared `MobManager`, because `mobs.js` is 670KB and was being edited by
another agent while this was built.

Finishing it means a provider seam on `MobManager`:

```js
mobManager.registerMobProvider('dragonball_tournament:tournament_host', {
  spawn, dimensions, update, onDamage, xp, texture,
});
```

with each of those six switches consulting the provider table for a type it does not recognise. That is a
mechanical change once `mobs.js` is quiet, and it is the last thing standing between the core and a genuinely
empty dependency on every designed world.
