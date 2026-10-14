# Creating mods

Use [the design](mod-system.md) to choose the right boundary and [the API](mod-api.md) for implemented methods. Rescue Adventure is the reference for a headless game package; Tournament illustrates the older browser mechanism integration.

## 1. Decide what the package owns

A content package introduces reusable definitions. An extension changes gameplay through supported APIs. A game defines its own rules using engine mechanics. A world template supplies seed/authored geometry and configuration for a game. Rescue Adventure is a game package with its campaign template in the same directory. Its runtime save is not part of its source package.

List what to reuse before porting: chunk storage, blocks, mesh generation, renderer, collision helpers, session transport, input routing and resource cleanup. List what belongs in the package: enemies, abilities, drops, quest conditions, generation rules, story, difficulty, models and UI presentation. Do not copy the source application’s renderer, main loop or global listeners into a mod.

## 2. Create a self-contained directory

Create `src/mods/<package-directory>/mod.json`, `index.js`, `server/game.js`, `client/`, `maps/` and provenance notes as appropriate. Keep all package-specific assets, rules and generators here. Do not add a particular enemy to `src/mobs.js`, a campaign-specific branch to `src/main.js`, or a map name to the world loader.

Use a stable lower-case underscore ID, a human-readable name and a three-part version. Declare engine compatibility, protocol, capabilities, dependencies and save schema. Declare the map filename and all owned Inspector definitions. Paths stay inside the package. Copy the API manifest example and adjust the fields; do not add unexplained capability names that the engine cannot implement.

## 3. Port rules into a factory

Export `createGame(options)` with `input`, `release`, `update` and `snapshot`. Move globals inside that factory. Seed RNG explicitly. Use supplied `dt`, not `Date.now()` or independent timers, to advance gameplay. Every nondeterministic action belongs in a recorded authority command or seeded RNG call.

Preserve source mechanics with regression tests before changing them. Rescue’s migration keeps five guardians, gated biomes, distinct heroes, food healing/revival, ammo, elemental weapons, difficulty, elites, boss abilities, Kamehameha, story, cage rescue and victory. Coordinate/rendering adaptation should not silently rewrite those rules.

Use engine scene definition handles for procedural models and animations; return terrain descriptions rather than creating chunk meshes. Use engine swept movement and package-owned permissions. The authority must run without a canvas, browser DOM or renderer. A module import must not start an application.

## 4. Register owned content and presentation

`register(api)` installs namespaced definitions and preview providers, then calls `registerGame` to mount an engine view. Keep registration metadata and `mod.json.provides` synchronized. Reusing a base block does not require duplicating it as a custom block.

UI templates live inside the package. Scope CSS and listeners to that view, and register all cleanup. Route actions through the session; do not mutate authority state from a DOM callback. Global story/menu commands require host ownership. Never accept health, loot, arbitrary object paths or executable code from client packets.

Keep visual style as package data, such as Rescue's `client/presentation.js`. The shared campaign presentation service owns lighting, materials, antialiasing, shadows and sight masking over the engine renderer/chunks. Preserve material types and shadow flags in scene definitions. Publish hero sight radii and transient light descriptors as snapshot data, without importing a GPU renderer into authority code. Verify cleanup restores the base game's rendering settings, and check the sight boundary in the actual rendered frame rather than only testing distance calculations.

Preview providers must be cheap and independent of a running campaign. They may construct definition-based models but must not start workers, rooms, game loops or camera control. Returning to Main Game must remove them. A core Inspector must remain free of package-specific entries even after playing a package world.

## 5. Choose multiplayer semantics explicitly

Specify maximum players, slot ownership, host permissions, cooperative versus per-player quest state, reconnect behavior, downed-player revival, pause behavior and victory. Test two real clients, late joining and malicious slot spoofing. A missing client must release held controls. A disconnected or lagging client must receive a full state on reconnect.

The existing Rescue adapter supports one/two local heroes and two online heroes. It does not yet support arbitrary player counts or persistent authenticated identities. Extending those is engine/session work, not a private transport hidden inside a mod. The separate base-game/native Java multiplayer path is not a mod-authority service.

## 6. Define terrain policy before loading

Finite or fully authored campaigns disable base procedural generation. Do not blend generated dirt into authored chunks by falling back to base generation when a campaign chunk is absent. Missing areas in a finite authored world are empty/out of bounds according to its policy. Reset pending chunk tasks before reseeding or loading a map.

Test a load while procedural chunk jobs are pending, then stream away and back. Verify exact saved voxels and a clear spawn. Test movement through open and closed gates at normal and dodge speeds. The source game’s terrain dimensions must match collision and visual geometry.

## 7. Save and upgrade safely

Use authority saves. Do not serialize GPU resources, DOM nodes or callbacks. Version world/game schemas and preserve stable content IDs. The current journal-based API reconstructs state under the same package implementation; changed code needs an explicit upgrade strategy. Refuse unsupported saves with an understandable error.

Local saves use browser storage. Online room saves live on the server and include the package hash; keep the room code to reopen the run. Package source maps are immutable templates, not writable multiplayer saves. Long-running games should add validated checkpoints to avoid unbounded replay cost.

## 8. Generate, verify and ship

```powershell
npm run mods:generate
npm run test:mods
npm run build
npm run dev -- --host 127.0.0.1 --port 3100
# In another terminal:
node scripts/test-rescue-adventure.mjs
node scripts/test-mod-inspectors.mjs
node scripts/test-tournament-world.mjs
node scripts/test-campaign-visuals.mjs
```

Add meaningful tests for your rules, authority validation, deterministic save restoration, two-world isolation, cleanup and package-only Inspector views. Inspect a rendered scene in a real browser: headless rule tests cannot catch camera, shadows, hidden overlays or input capture issues.

Review the diff for imports of a particular package from engine modules, copied renderer infrastructure, mutable shared globals, untracked listeners/timers, unvalidated input and invented version ranges. Record asset/source provenance without assuming a third party’s license. Generated catalogs belong in the change; temporary screenshots and campaign saves do not.

## Rescue Adventure controls and launch

Open **Designed Worlds**, select **Rescue Adventure**, choose solo/local co-op and difficulty, then begin the story. Mason uses WASD to move, J to attack, K to shoot, L to charge Kamehameha and U/N to dodge. Jayden uses arrows, Enter to attack, Backslash to shoot and Backspace to dodge. P pauses; M expands the map; the wheel changes camera zoom.

**HOST NEW ONLINE** starts a new cooperative authority on the running Node/Vite host. Share the displayed room code; the second browser opens Rescue Adventure and chooses **JOIN ROOM**. Mason keeps his controls; Jayden uses the second-player controls. **SAVE RUN / LOAD RUN** apply to local sessions. Online sessions autosave on the server and reopen through **JOIN ROOM** with their room code.

The shared browser view uses engine voxel chunks with package-defined terrain palettes, stylized props, warm lighting, shadows and a soft hero sight boundary. Gameplay mechanics and visual configuration belong to the package; GPU implementation belongs to the engine. The browser toolbar and scope selector are engine integration controls rather than source-game rules.
