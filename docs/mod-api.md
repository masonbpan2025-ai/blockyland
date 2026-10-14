# Mod API v1

This is the implemented API, not a promise that every extension point in the original proposal exists. `src/mods/compatibility.js` defines engine API `1.0.0` and protocol `1`. Related documents: [design](mod-system.md) and [authoring](creating-mods.md).

## Manifest contract

```json
{
  "formatVersion": 1,
  "id": "my_adventure",
  "name": "My Adventure",
  "version": "1.0.0",
  "type": "game",
  "engineApi": "^1.0.0",
  "protocolVersion": 1,
  "requires": ["voxel_world", "scene_definitions", "authoritative_sessions"],
  "dependencies": {},
  "optionalDependencies": {},
  "entrypoint": "./index.js",
  "serverEntrypoint": "./server/game.js",
  "saveSchemaVersion": 1,
  "mechanism": "my_adventure",
  "maps": ["My_Adventure.json"],
  "provides": {"blocks": [], "items": [], "mobs": []}
}
```

`id` is stable and must not be `minecraft`. `type` is `game`, `extension`, `content` or `world`; it classifies the package rather than granting privileges. `serverEntrypoint` must export `createGame`. Entry paths must stay within the package. Map entries are local JSON filenames. `provides` is metadata for discovery and Inspector listing; executable registration still installs the actual definitions. Keep both consistent.

The v1 content registry records ownership and metadata. Registering a block does not yet allocate a new numeric voxel ID or add arbitrary materials to the older engine block table. The current campaign adapter reuses existing engine blocks. Likewise, item registration alone does not install inventory behavior; Rescue implements its equipment rules in its authority. A general dynamic block/material allocator and inventory component API need an engine extension before a package can rely on them.

Available capability names are `voxel_world`, `scene_definitions`, `local_coop`, `authoritative_sessions` and `gameplay_policies`. Declaring an unknown capability rejects the package. Compatibility ranges support `*`, exact, caret and tilde three-part versions only.

## Client package entrypoint

Export `register(api)`, optionally async. Registration is called after dependencies pass validation. A failure rolls back that package’s registrations and disposers.

| Method | Parameters | Result and behavior |
| --- | --- | --- |
| `registerBlock`, `registerItem`, `registerMob`, `registerMap` | package-local path, definition | Full namespaced ID or `null` on registration rejection |
| `register(kind, path, data)` | supported registry kind, local path, metadata | Generic registry registration |
| `exists(kind, fullName)` | kind, namespaced ID | Checks loaded content including core/dependencies |
| `registerMobProvider(path, provider)` | local mob path, preview/provider object | Installs a runtime/Inspector spawn provider with owned cleanup |
| `registerGame(definition)` | `{name, features?, createView(api,mapData)}` | Registers this package’s world mechanism and manages the engine view lifetime |
| `onDispose(callback)` | cleanup function | Runs on unload, in reverse registration order |
| `schedule(callback, delayMs)` | callback and delay | Tracked timeout, canceled on unload |

`registerGame` uses the package ID as the mechanism ID. Its `createView` must return an engine view with `exclusiveSimulation: true` and `dispose()`. Activation is skipped in Inspectors. A repeated activation disposes the previous view. Inspector previews use providers rather than starting a campaign authority.

For the bundled campaign view:

```js
import { createGamePackageView } from '../../engine/gamePackageView.js';
import html from './client/ui.html?raw';
import css from './client/style.css?raw';
export function register(api) {
  api.registerGame({
    name: 'My Adventure',
    createView(api, map) {
      return createGamePackageView(api, {
        modId: api.modId, html, css, seed: map?.seed ?? 2026,
        saved: map?.modState?.[api.modId] ?? null,
      });
    },
  });
}
```

The current `createGamePackageView` implements the Rescue-style finite campaign, two hero slots, HUD IDs and minimap. Its session and scene services are reusable; it is not yet a universal arbitrary-game UI/camera adapter. A different game can compose `ModClientSession` and `SceneDefinitionView` in an engine-supported view rather than pretending that Rescue’s HUD is universal. Extract a reusable engine service when multiple games need it.

### Legacy API

`registerMechanism(id, definition)`, `onLeaveWorld(cleanup)`, `attach(name, value)` and `extend(target, fields)` support the Tournament and existing browser engine integration. `extend` saves previous property descriptors and restores them on disposal. `api.game`, `api.registry` and `api.loader` remain exposed for compatibility. This is an architectural convention for trusted code, not an enforced capability sandbox. New authoritative rules must not use these escape hatches to mutate the client’s gameplay state.

## Authority factory

`server/game.js` exports `createGame(options)`. Each call owns all mutable state. It must run in both Node and a browser worker without `window`, `document`, DOM events, WebGL, RAF, filesystem I/O or wall-clock gameplay randomness.

```js
export function createGame(options = {}) {
  // Private, per-world state; seeded RNG and deterministic updates.
  return {
    input(slot, intent) { /* validate and apply; return boolean */ },
    release(slot) { /* clear held buttons for this slot */ },
    update(dt) { /* advance exactly one supplied simulation step */ },
    snapshot() { /* return structured-cloneable public data */ },
  };
}
```

Options are chosen by the authority, not an unrestricted client configuration. Rescue supports `seed`, `coop`, `difficulty` (`easy`, `normal`, `hard`) and `online` (locks cooperative mode).

`input` returns `true` only for accepted commands. Rescue accepts `{type:'key',code,down:boolean}` and a small allowlist of `{type:'button',id}` commands. Slot 0 has WASD/J/K/L/U/N; slot 1 has arrows/Enter/Backslash/Backspace. Global buttons require slot 0. Unsupported actions, unknown controls and malformed key states are rejected. There is no client `setHealth`, `setPosition`, `awardLoot` or `unlockGate` API.

## Snapshot contract

The session strips the full scene/terrain from public state to produce full frames and deltas. A snapshot contains:

- `seed`: terrain generation identity; a change forces a full reset.
- `scene`: flat scene definitions from `createPresentationGraph().snapshot(root)`.
- `terrain`: finite grid descriptors for initial/reset terrain distribution.
- Public game fields, including `phase`, `players`, campaign state and `ui`.
- `events`: presentation effects such as tone requests; draining these must not alter gameplay state or RNG.

The shared view currently expects Rescue’s player `{name,x,z,hp,max,sight}` and terrain `{x,z,h,b,wet,road,prop,block,bridge,shade}` vocabulary. Terrain cells are two world units. Optional `objective` contains `{x,z}` only; optional `lighting` contains data for torches, spell and explosion flash. These are campaign adapter conventions, not arbitrary imported Three.js scenes.

## Engine presentation services

`createPresentationGraph()` in `src/engine/presentationGraph.js` returns `{api,snapshot}`. Its `api` supplies serializable group/shape handles with vector transforms and color math. Supported geometry is box and ring; supported material fields include color, emissive, opacity, transparency and blending. Handles do not allocate WebGL objects. Their constructor names mirror a small subset of the source game’s Three API to preserve models during migration; they are engine-owned data types.

Each scene record contains:

```js
{id: 42, parent: 1, p: [x,y,z], r: [rx,ry,rz], s: [sx,sy,sz], v: true,
 geometry: {type: 'box', parameters: [w,h,d], offset: [0,0,0]},
 material: {color: 0xffffff, emissive: 0, opacity: 1, transparent: false}}
```

`SceneDefinitionView(scene, yOffset=0, configureMesh=null)` creates GPU resources on the client. Scene definitions also preserve mesh `castShadow`/`receiveShadow` and material `kind` (`standard`/`basic`), `roughness` and `metalness`. The optional mesh callback configures newly created meshes, for example applying the engine sight mask. `apply(nodes,removed=[],reset=false)` changes the view; `dispose()` removes its owned resources. IDs must be stable for a live node and unique within one authority. The transport does not serialize `userData`, functions or internal gameplay objects.

`createGamePackageView` accepts an optional `presentation` profile: `zoom`, `exposure`, `sightEdge`, `sunlight:{color,intensity}`, `hemisphere:{sky,ground,intensity}`, terrain palettes and per-biome prop palettes. See `src/mods/rescue-adventure/client/presentation.js` for a complete profile. `CampaignPresentation` applies it to the shared renderer with ACES, multisample rendering, shadowed sunlight and bounded point lights. Its `SightMask` uses the union of living heroes' sight radii with a soft edge. Styled materials replace chunk atlas materials only for this view; engine instancing renders decorative props. Disposal restores base lights, fog, tone mapping, pixel ratio and shadow settings and frees owned GPU resources. Package configuration must not mutate base shared materials.

`createUiState()` provides declarative handles with `textContent`, `hidden`, `disabled`, `style`, attributes and callback slots. `snapshot()` emits data only. The client maps that state into a scoped template. An authority must never put untrusted HTML into state.

Untouched text, hidden and disabled fields are `null`; the client preserves the template value. An explicit empty string clears text, while explicit booleans update visibility/disabled state. Treating unset values as empty text or `false` erases static labels and reveals hidden controls.

`gridPassable(grid,x,z,fromY,radius,allowed)` checks a finite height grid and delegates game permissions to `allowed(tile)`. `moveController(entity,dx,dz,{floor,passable})` uses short swept steps to prevent crossing a locked gate through one long dodge. The game defines gate state, not a second physics implementation.

`installVoxelCampaign(game,tiles,seed)` converts finite campaign descriptors into actual engine chunks using existing block IDs. It resets streaming, installs authored terrain, invalidates caches and rebuilds meshes. The base procedural generator remains disabled for that world.

## Session services

`new ModSession(factory,options)` creates one authority. `command(slot,sequence,intent)` validates slot/sequence/packet size, calls the game and journals accepted commands. `step()` advances `1/30` second. `release(slot)` clears controls and journals that release. `frame(full=false)` produces `{protocol,apiVersion,tick,reset,scene,removed,state,terrain?}`. `save()` returns a versioned command journal. `ModSession.restore(factory,saved)` replays it under the same rules.

`new ModClientSession(modId,options,onFrame,onError)` starts a local worker. `input(intent,slot)`, `release(slot)`, `save()`, `restore(saved)`, `connect(room?)` and `dispose()` control the session. `connect()` without a room hosts a new online game; with a room it joins or reopens that server save. Successful connection stops the local worker. Online saves remain on the authority.

Worker saves include `packageId` and `packageVersion`. Restoring another package or incompatible version is rejected while the previous local session continues. Base first-person pointer lock, inventory and hotbar inputs remain disabled while an exclusive game view owns controls. The campaign view releases an existing pointer lock and handles its own pause/menu inputs.

## Wire protocol v1

First packet is `{type:'host',modId,options,protocol:1}` or `{type:'join',room,protocol:1}`. The response is `joined` with slot, room, protocol, API version, package versions/hashes and content metadata, followed by a full `frame`. Thereafter a client sends `intent` with `sequence` and `intent`, `release`, or host `save`. The server derives the slot from the socket. Errors use `{type:'error',message}`. Input size is at most 4 KB per WebSocket packet and accepted intent JSON at most 512 characters; rate limit is 120 packets/second per connection. The current host permits eight active worlds with two slots each.

Persistence and protocol compatibility are independent: changing a save schema requires migration; changing a wire schema requires a protocol version; changing a public API incompatibly requires a major API version. See the design document for current trust and production limitations.
