# Working in this repository

Guidelines for every agent (and person) changing code here.

## Tests

- **Never run the full test suite while making changes.** Do not run `npm test` or `npm run test:all`.
  The full run takes more than seven minutes, can run out of memory, and slows the machine for anyone else
  working on it (several agents often share it, and film renders run in the background).
- **Start with the tests your change can reach:** `node scripts/test.mjs --files src/bed.js,src/blockGeometry.js`
  (the files you changed), or `node scripts/test.mjs --changed` (every file changed in the working tree; other
  agents' uncommitted edits count too, so prefer `--files`).
  - It follows imports backwards from each file and runs the **nearest** tests: those that import the file or name it
    in a string, else the closest tier that has any. `--list` shows the selection and the import chain that picked
    each test, without running anything. `--depth 2` or `--deep` adds tests further away.
  - It refuses more than 60 files: a file most tests import (`src/blocks.js`, `src/world.js`) selects hundreds. Name
    a narrower file, run a group instead, or pass `--yes` when you really mean it.
  - A test file you changed or added runs three times and must pass all three, so a flaky test is caught now.
  - It reports changed files that no unit test reaches (HTML, CSS, assets): those are covered, if at all, by the
    Playwright suites or `npm run test:preflight`.
- **Or run the group that covers the area**, for example `node scripts/test.mjs studio`. Run
  `npm run test:list` to see the groups and their files.
- Every run takes one of a few machine-wide slots (half the CPU threads; `BLOCKYLAND_TEST_SLOTS` overrides) and waits
  while other runs hold slots and less than 2 GB is free. It says when it is waiting. `--no-slots` skips this.
- When you add a test file, add it to the matching group in `scripts/test.mjs`.
- If a relevant test fails and you think your change did not cause it, check by running that test on a clean
  checkout of `HEAD` before going further. Say which failures were already there. A worktree is the quickest way:
  `git worktree add --detach C:\Users\<you>\AppData\Local\Temp\blhead HEAD`, then link `node_modules` into it
  (PowerShell: `New-Item -ItemType Junction -Path <worktree>\node_modules -Target <repo>\node_modules`). Keep the path
  short: a checkout under a long folder fails on Windows with "Could not reset index file".
  **Remove the junction before the worktree**: `(Get-Item <worktree>\node_modules).Delete()`, then
  `git worktree remove --force <worktree>`. `git worktree remove` follows the junction and deletes the shared
  `node_modules` (it happened on 2026-11-01; `npm install` repaired it).

## Write tests with signal

- Test what a player or a caller can observe, not the words in source, comments or docs. Reading a source file as
  text is for machine-checked contracts only (a wiring table, a generated file).
- Take expected values from an independent source (the Minecraft Wiki, vanilla data, a hand calculation written in
  the test), never from the code under test.
- Check outcomes, not only that a stub was called.
- Skip tests of trivial constants and getters, and behaviour another test already covers.
- Don't pin implementation details: a harmless refactor should not break a behaviour test.
- Never delete a test that pins vanilla behaviour to make a change pass: fix the change, or say why vanilla is not
  the target.

## Where things live

`src/main.js` boots the game: `class Game` owns the scene, the player, the world and every manager, binds the start
screen (`bindStartScreen`) and runs the frame loop (`animate`). Input arrives in `handleLeftClick`,
`handleRightClick`, `breakTargetBlock` and `updateRaycast`. Most features live in their own module, and `main.js` calls
them. Tests import those modules directly, with no browser. Debug pages (`mob-debug.html` and the others) load one
subsystem without the whole game.

Paths are under `src/` unless they start with another top-level folder. Rows are ordered by how often the area
changed in the 60 days to 2026-11-01.

| Area | Main files | Unit tests | Page, e2e, docs |
| --- | --- | --- | --- |
| Mobs: species, AI, models | `mobs.js` (about 15,000 lines: every mob's model and update), `animalBehaviors.js`, `hostileMobBehaviors.js`, `creeperBehavior.js` and the other behaviour modules, `mobMotion.js`, `entities.js`, `mobVisuals/modelBuilder.js` | group `mob` | `mob-debug.html` (`mobDebug.js`, `mobDebugSession.js`, `mobShowcase.js`), `docs/mob-inspector.md` |
| Blocks: registry, shapes, harvesting | `blocks.js`, `blockGeometry.js`, `blockModels.js`, `blockModelShapes.js`, `slab.js`, `extraContent.js` (generated), `blockHarvestData.js`, `miningRules.js` | group `survival` | `block-debug.html` (`resourceDebug.js`) |
| Game loop, input, interaction | `main.js`, `player.js` | `--files src/main.js` (72 tests reach it) | `e2e/startButtons.pw.js` |
| Items, creative catalogue, recipes | `creativeCatalog.js`, `extraItems.js`, `addedItems.js`, `crafting.js`, `extraRecipes.js`, `inventory.js`, `itemVisuals.js` | groups `survival` and `build` | `item-debug.html`, `e2e/craftCommand.pw.js` |
| UI, HUD, start screen | `ui.js`, `style.css`, `index.html`, `progressOverlay.js` | `tests/domWiring.test.js`, `tests/startScreenBinding.test.js`, `npm run test:preflight` | `e2e/startButtons.pw.js` |
| Chunks: generation, streaming, meshing | `world.js` (chunks and terrain), `chunkStreamer.js`, `terrainWorkerClient.js`, `terrainService.js`, `terrainWorker.js`, `mesher.js`, `chunkBatches.js`, `textures.js` | groups `world`, `render` and `terrain` | `e2e/terrainWorker.pw.js` |
| Worlds and saves | `mapManager.js`, `saveSchema.js`, `mobState.js`, `worldLifecycle.js`, `worldTeardown.js` | group `persist` | `docs/mob-state-persistence.md` |
| Structures and world generation | `worldgen/index.js` (the engine), `worldgen/registry.js`, `worldgen/jigsaw.js`, `worldgen/generators/`, `worldStructures.js` (the bridge to chunks) | groups `structures` and `caves` | `structure-inspector.html`, `docs/STRUCTURE_ARCHITECTURE.md` |
| Biomes | `biomes.js`, `biomeInspector.js`, `biomeInspectorSession.js` | group `world` | `biome-inspector.html`, `e2e/biomeFeatures.pw.js` |
| Agent Terminal (key C): offline presets, or the player's own AI app over MCP | `worldAgent.js` (plans, presets), `agentPlans.js`, `agentPerception.js`, `agentCapabilities.js`; Agent Control: the npm package `blockyland-mcp`: `packages/blockyland-mcp/protocol.js` (the tool table) and `packages/blockyland-mcp/server.mjs` (the MCP server), `agentControl/gameTools.js`, `agentControl/bridge.js` | group `agent` | `e2e/agentControl.pw.js`, `docs/agent-control.md`, `npm run test:agent-control:claude` (a real Claude Code, by hand) |
| Resource registry and parity audits | `resourceRegistry.js`, `resourceShowcase.js`, `resourceDebug.js` | group `resources` | `block-debug.html`, `docs/block-parity-gap-review.md` |
| Mob spawning | `spawning/mobSpawnManager.js`, `spawning/naturalSpawner.js`, `spawning/mobSpawnPredicates.js`, `spawning/lightEngine.js` | group `mob` | `docs/MOB_SPAWNING_ARCHITECTURE.md` |
| Commands | `commandRunner.js` (the dispatcher), `commands.js` (parsing, `/give`), `advancedCommands.js` | `tests/commandParity.test.js`, group `survival` | `e2e/giveCommand.pw.js`, `docs/give-command-agent-guide.md` |
| Redstone and rails | `redstone.js`, `redstoneComponents.js`, `rails.js`, `worldMechanisms.js` | group `redstone` | |
| Stations: furnace, brewing, enchanting, anvil, smithing, chests | `furnace.js`, `brewing.js`, `enchanting.js`, `anvil.js`, `smithing.js`, `chest.js` | groups `build` and `survival` | `e2e/enchantCommand.pw.js`, `e2e/smithCommand.pw.js`, `e2e/brewCommand.pw.js` |
| Survival: hunger, effects, potions, death, beds | `hunger.js`, `statusEffects.js`, `potionUse.js`, `splashPotion.js`, `deathAndRespawn.js`, `bed.js` | group `survival` | `e2e/survivalBot.pw.js` |
| Combat and bosses | `arrows.js`, `bow.js`, `combatParticles.js`, `bossFights.js` | group `combat` | `docs/arrows.md` |
| Water, lava, weather | `waterSimulation.js`, `water.js`, `waterRules.js`, `lavaSimulation.js`, `weather.js` | group `world` | `e2e/waterBot.pw.js`, `docs/lava.md` |
| Nether and End | `netherPortal.js`, `netherTerrain.js`, `endProgression.js`, `endTerrain.js` | groups `nether` and `end` | `docs/nether-mob-behavior.md` |
| Villagers and trading | `villagerEconomy.js`, `villagerBreeding.js` | `tests/villagers_economy.test.js`, `tests/tradingParity.test.js` | |
| Multiplayer | `multiplayer/shareSession.js` (the host is the authority), `multiplayer/shareProtocol.js` (checks every guest message), `multiplayer/worldSyncManager.js`, `server/shareServer.js`, `cloudflare/share/` | group `sharing` | `share-debug.html`, `e2e/share.pw.js`, `docs/deploy-cloudflare.md` |
| Mods and mini-games | `mods/loader.js`, `mods/catalog.generated.js`, `engine/modSession.js`, `engine/mod.worker.js`, `mods/bedwars/`, `mods/skywars/` | group `mods` | `docs/creating-mods.md`, `e2e/bedwars.pw.js` |
| Building Studio and schematics | `buildingStudio.js`, `buildingLibrary.js`, `buildingContext.js`, `io/nbt.js`, `io/codecs.js` | groups `studio` and `io` | |
| Data packs | `dataPack.js`, `dataPackRuntime.js`, `dataPackPresets.js`, `dataPackPanel.js` | group `survival` | |
| Rendering and graphics settings | `lightweightShader.js`, `atmosphere.js`, `graphicsSettings.js`, `lighting.js` | group `render` | `e2e/graphicsSettings.pw.js`, `docs/lightweight-shader.md` |
| Player bot | `playerBot.js`, `playerBotSurvival.js`, `vendor/mineflayer-pathfinder/` | `npm run test:bot` | `e2e/playerBot.pw.js` |
| Audio | `audio.js` (synthesised with Web Audio: the game loads no sound files; only the films have recorded audio, kept out of git under `public/cinema-*`) | | |
| Films | `cinema/civFilm.js`, `cinema/wedFilm.js`, `cinema/movies.js`; the rules are in `cinema/CINEMA_GUIDELINES.md` | | `civ-1500.html`, `movies.html` |
| Textures and asset packs | `textures.js`, `packsModal.js`, `skinManager.js`, `public/assets/`, `public/assets/PROVENANCE.json` | group `resources` | `THIRD_PARTY_NOTICES.md` |

`tests/agentsMap.test.js` fails when a path or a group in this table no longer exists: update the row when you move a
file.

## Assets

- Every file under `public/assets/` needs an entry in `public/assets/PROVENANCE.json` that says where it came from:
  `original`, `generated` (with `by`: the script), `third-party` (with `from` and `license`: an openly licensed
  file such as the Pixelify Sans font), `vanilla` (Mojang's, identical to PrismarineJS minecraft-assets),
  `vanilla-derived` (a script made it from vanilla files; `packs/faithful_64x/` is one, an upscale of the vanilla
  textures and not the Faithful community pack), or `unknown` until someone confirms it. After adding assets, run
  `node scripts/seed-asset-provenance.mjs` (it keeps confirmed entries), then correct the new entries by hand.
  `node scripts/checkPublicTree.mjs` checks this on every push.
- `THIRD_PARTY_NOTICES.md` lists the outside sources and their terms. Add a row when you bring in a new one.
- Never commit Mojang's game files themselves: `.jar`, `.class` or decompiled Java source. The same check rejects
  them.

## Before every push and deploy

- **`npm run test:preflight` must pass** (about 3 minutes): the public-tree check, the start-screen wiring tests, a
  production build, and `e2e/startButtons.pw.js`, which clicks every start-screen button in a real browser and builds
  a world through Generate New World → Create World. The git pre-push hook (`.githooks/pre-push`) runs it, and so
  does `npm run deploy:cloudflare`. `npm install` turns the hook on (`core.hooksPath`). Do not skip it with
  `--no-verify`.
- Tests that start the game must **click** the start buttons, not call `game.generateNewWorld()`: a suite that calls
  the function directly cannot notice buttons that do nothing.
