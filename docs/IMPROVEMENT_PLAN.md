# Blockyland Improvement Plan (from the Horizon review)

As of 2026-11-01. This file is the current version. The first draft was a
[Claude doc](https://claude.ai/artifact/Q8XNWbSTuKcejKmEWPwUqH), which isn't updated any more. Items 1–3 (Phase A) are
done, and item 4: see [Progress](#progress).

## Summary

Seven changes are worth making. The most useful lessons from Horizon are about **how agents work on the code**, not
about the engine: tests chosen automatically from what a change touches, a map of where each feature lives, and a
single command table that drives an MCP server. The earlier advice focused on engine rewrites (paletted storage,
WebAssembly, a worker-hosted server), and most of those don't fit Blockyland.

This plan comes from reading a shallow clone of [horizon-rust/horizon](https://github.com/horizon-rust/horizon) at
commit `ed102e0` (2026-11-01): its `AGENTS.md`, `docs/architecture.md`, `docs/parity-workflow.md`,
`docs/agent-control.md`, `docs/port-ledger.md`, `docs/security.md`, `tools/check_public_tree.py`,
`research-lock.json` and `crates/horizon-client-render/src/streaming.rs`. Each Horizon idea was then checked against
the Blockyland code.

The review changed three earlier calls:

- **Test selection moved to the top.** Horizon's runner reruns only the harnesses a change can reach. That fixes
  Blockyland's "never run the full suite" problem directly.
- **The guest-validation audit was dropped.** `src/multiplayer/shareProtocol.js` already checks every guest message
  for finite numbers, coordinate bounds, reach, damage caps, string lengths and skin size.
- **Unpinned data sources were added.** `scripts/generate-mc-data.mjs` reads minecraft-data from `master`, and
  `build-vanilla-pack.mjs` reads the `1.21.4-data` branch, so running either again can produce different output.
  Horizon pins every input by hash.

## What Horizon does, and how Blockyland compares

Horizon's ideas that matter here are mostly in its tooling, and Blockyland already has some of them.

| Horizon practice | Where in Horizon | Blockyland today |
| --- | --- | --- |
| Runs only the harnesses a change can reach. It traces each harness's dependencies, caches passes by file content, and shares job slots and a memory budget across every agent on the machine | `tools/parity.py --changed`, `tools/parity_reach.py`, `docs/parity-workflow.md` | Groups are listed by hand in `scripts/test.mjs` (172 lines). Agents choose a group themselves, and nothing limits concurrent runs |
| A new or changed harness must pass 3 runs in a row, or it is reported FLAKY | `tools/gate.py` | No flake check |
| An agent map: crate → what it owns, subsystem → files, and the 40 most-changed areas → files → checks | `AGENTS.md`, `docs/architecture.md` | `AGENTS.md` covers only test rules. There are 393 modules in `src/` and no map |
| "Write tests with signal": test behaviour, use independent expected values, never derive the answer from the code under test | `AGENTS.md` | Not written down |
| One command table produces the CLI help, argument checks, MCP tool schemas and the reference doc. A test fails when the doc is stale | `bin/horizon-ctl/commands.rs`, `docs/agent-control.md` | The Agent Terminal (`src/worldAgent.js`, 6,014 lines) and chat commands (`src/commands.js`) are separate. External agents can't call either |
| Agent control is local-only: a socket or loopback port plus a 128-bit token, off by default for games players start. Errors have fixed kinds, destructive tools need `confirm`, and one "No AI" switch turns it all off | `docs/agent-control.md` | Playwright scripts drive the game through `window.game` (`src/main.js:5425`) |
| Ships no Mojang files. A pre-commit and pre-push check rejects jars, decompiled code and game assets | `tools/check_public_tree.py`, `horizon-prepare` | Serves Mojang textures from PrismarineJS/minecraft-assets (`scripts/download_assets.js`, 1,009 files in `public/assets/blocks`), plus a 64x pack upscaled from them (`packs/faithful_64x/`, made by a script, despite its name not the Faithful community pack). No `LICENSE` file |
| Pins every outside input by hash | `research-lock.json` | minecraft-data read from `master`, mcmeta from a branch name |
| Generates, lights and meshes chunks in a worker pool | `streaming.rs` | Terrain generation runs on a checked worker (`src/terrainWorkerClient.js`). Meshing stays time-sliced on the main thread (`src/mesher.js`) |
| A port ledger maps each vanilla method to the functions that port it, and lists gaps | `tools/port_ledger.py` | About 60 `docs/*-parity.md` files, but no index |
| Validates guest actions on the host | `lan/anticheat.rs` | Already done in `src/multiplayer/shareProtocol.js` |
| Single player runs on a server thread | `game/integrated.rs` (default since #1514) | One main thread |

## Improvements, in priority order

Items 1–3 are small and pay off at once. Item 4 is the largest new capability. Items 5–7 are smaller or wait on a
measurement.

| # | Item | Why | Effort | From Horizon |
| --- | --- | --- | --- | --- |
| 1 | Choose tests from the change | Agents stop guessing groups, and shared-machine runs stop running out of memory | S–M (1 day) | `parity.py --changed`, job slots, flake gate |
| 2 | Agent map in `AGENTS.md` | 393 modules, and every agent searches for the same things again | S (half a day) | `AGENTS.md`, `architecture.md` |
| 3 | Asset provenance and licensing | Mojang textures served from a public domain are the largest legal risk | Phase A: S. Phase B: L | `check_public_tree.py`, zero-asset rule |
| 4 | MCP agent control | Claude Code and other MCP clients can drive and inspect a live game | M–L (2–4 days) | `horizon-ctl`, `agent-control.md` |
| 5 | Pin data sources | The same script run twice should produce the same data | S | `research-lock.json` |
| 6 | Meshing on a worker | Fewer slow frames at chunk borders, if meshing is still the cost | M–L, measure first | `streaming.rs` worker pool |
| 7 | Parity ledger | One index of what matches vanilla, what is tested and what is missing | S–M | `port_ledger.py` |

### 1. Choose tests from the change

**Goal.** `node scripts/test.mjs --changed` runs the unit tests that a change can reach, and nothing else.

**Scope.**

- Parse the static `import` lines in `src/`, `tests/` and `server/` into a dependency graph, cached by file content.
- Collect the changed files: `git diff` against `HEAD`, plus staged and untracked files. A `--base <ref>` flag
  compares against a branch instead.
- Select every test file whose imports reach a changed file. `--list` prints the selection and why each test was
  picked, without running anything.
- Fallback: when a change touches a file with very many dependents (`src/main.js`, `src/world.js`), or a file the
  graph can't follow (HTML, CSS, `new URL(...)` workers), print the matching groups and ask before running more
  than about 40 files.
- Machine-wide job slots: a lock directory in the OS temp folder caps concurrent runs across agents (default: half
  the CPU threads). A run waits while free memory is under 2 GB.
- Flake gate: a new or changed test file runs 3 times and must pass all 3.

**Files.** `scripts/test.mjs`, a new `scripts/testGraph.mjs`, `AGENTS.md`.

**Done when.**

- `tests/testGraph.test.js` passes against a small fixture tree, including a re-export and a cycle.
- Changing only `src/bed.js` selects `tests/bed.test.js` and its callers' tests, and not the whole suite.
- `AGENTS.md` tells agents to run `--changed` first.

**Limit.** This picks `node --test` files only. Playwright e2e and `npm run test:preflight` stay as they are.

### 2. Agent map in AGENTS.md

**Goal.** An agent finds the files and tests for a feature without searching.

**Scope.**

- A subsystem table: area → main files → test group or files → debug page (`mob-debug.html`,
  `structure-inspector.html` and the rest). About 30 rows, ranked by how often each area changed in the last 60
  days of `git log`.
- A short "how the game is organised" section: `main.js` boot, the `World` and chunk pipeline, mobs, the agent
  terminal, multiplayer, mods and the cinema.
- Horizon's "write tests with signal" rules, adapted.
- A test that fails when a path in the table no longer exists.

**Files.** `AGENTS.md` (or a new `docs/ARCHITECTURE.md` linked from it), `tests/agentsMap.test.js`.

**Done when.** Every path in the table exists and the test is in a group.

### 3. Asset provenance and licensing

**Goal.** You know where every shipped asset comes from, and no new Mojang-derived file arrives unnoticed.

**Phase A (now, small).**

- Add a top-level `LICENSE` for your own code. You choose the license.
- Show "Not affiliated with Mojang or Microsoft" on the start screen and the site footer, not only in `README.md`.
- Add `THIRD_PARTY_NOTICES.md` listing PrismarineJS minecraft-assets, the upscaled 64x pack, mineflayer-pathfinder
  and misode/mcmeta, with their licenses.
- Add `public/assets/PROVENANCE.json`, mapping each folder or file to `original`, `generated`, `vanilla` or
  `vanilla-derived`. Seed it from the download and generation scripts.
- Add `scripts/checkPublicTree.mjs` to the pre-push hook. It rejects `.jar`, `.class` and decompiled Java, and any
  new file under `public/assets` with no provenance entry.

**Phase B (your decision, large).** Make a non-Mojang texture set the default, starting from the existing generators
(`generate_all_block_textures.js`, `generate-parity-assets.py`). Let players load their own vanilla resource pack
through the existing packs system (`src/packsModal.js`), stored in IndexedDB and never uploaded.

**Done when (A).** The check passes on the current tree and fails on a test file added without provenance.

### 4. MCP agent control

**Goal.** Claude Code, Cursor or any MCP client can start Blockyland, play it and read its state through typed tools.

**Design, following Horizon.**

- **One command table**, `src/agentControl/commands.js`. Each entry has a kebab-case name, a parameter schema, flags
  (`destructive`, `reachesOthers`) and a handler that calls existing game code. That code includes
  `commandRunner.js`, the inventory, the player controller and `agentPerception.js`.
- **The table generates the rest**: the MCP tool list, the argument checks and `docs/agent-control-commands.md`. A
  test fails when that doc is stale.
- **Transport.**
    - `scripts/blockyland-mcp.mjs` is an MCP server over stdio.
    - A `launch` tool starts the Vite dev server if needed, opens Chromium through Playwright (headless or
      visible), and clicks the start buttons as `AGENTS.md` requires.
    - Other tools travel over Playwright's page channel, so no listening port is needed.
    - A later option is a loopback WebSocket with a token, for a tab you opened yourself.
- **Replies.** Every reply is one JSON object. Errors use fixed kinds: `usage`, `unknown`, `state`, `busy`,
  `timeout`, `connection`, `denied`. Each error message says what to do next.
- **Safety.** Destructive tools (`fill`, `setblock`, deleting a world) need `confirm: true`. Nothing is exposed in
  the production build unless the player turns on Agent Control.
- **First tools:** `launch`, `state`, `screenshot`, `command`, `look`, `move`, `goto`, `break`, `place`,
  `inventory`, `select`, `wait-ticks`, `logs`, `quit`.

**Done when.**

- `claude mcp add blockyland -- node scripts/blockyland-mcp.mjs` connects.
- An e2e test (`e2e/agentControl.pw.js`) launches, mines a block, checks the inventory and quits.
- The doc-staleness test passes.

**Later.** The in-game Agent Terminal could call the same table, so it uses the same tools that external agents get.

### 5. Pin data sources

**Goal.** Running a data generator again reproduces the committed output, unless you choose to update.

**Scope.** Add `data-lock.json` with commit SHAs for minecraft-data, misode/mcmeta and minecraft-assets. Make
`generate-mc-data.mjs`, `build-vanilla-pack.mjs` and `download_assets.js` read from it, with `--update-lock` to move
to a newer commit.

**Done when.** No generator fetches from `master` or a branch name, and a test checks that each URL contains a
40-character SHA.

### 6. Meshing on a worker (measure first)

**Goal.** Fewer slow frames when crossing chunk borders.

**Step 1.** Use `scripts/bench-world.mjs` or a Playwright trace to record the share of border-crossing frames spent
in `src/mesher.js`. If it's under about 20%, stop here.

**Step 2.** Mesh on a worker using the terrain worker's pattern: copy the chunk and its neighbours' edges, mesh,
check the first few results against the main thread, then adopt. Keep main-thread meshing as the fallback.

**Done when.** The p95 frame time while walking across borders at render distance 8 drops by an amount set in step
1, and `node scripts/test.mjs render` passes.

### 7. Parity ledger

**Goal.** One generated page answering "how close is feature X to vanilla, and what tests prove it?"

**Scope.** Add a short front-matter block to each `docs/*-parity.md` file: feature, vanilla version, status, test
files and last audit date. `scripts/parityLedger.mjs` builds `docs/PARITY_LEDGER.md` from them, and a test fails
when a listed test file doesn't exist. Matching each vanilla method, as Horizon does, isn't possible without
decompiled code, and that is out of scope.

## Not doing

| Idea | Why not |
| --- | --- |
| Bit-for-bit Java oracle harnesses | Horizon's oracles run decompiled 26.3 jars and mirror HotSpot's `Math` and the order of RNG draws. Blockyland's terrain uses its own noise, so exact equality could never pass. Item 5 covers the useful part: deterministic data checked against pinned vanilla output |
| Single player on a worker-hosted server | Horizon needed hundreds of PRs and still lists open `[server-thread]` gaps. With 393 modules sharing main-thread state, this would be a rewrite. Moving hot paths to workers, as terrain was and as item 6 proposes, gets most of the gain |
| Paletted, bit-packed chunk storage | Chunks are already a flat `Uint16Array` (`src/world.js:231`), which is faster to read than unpacking bits. Horizon packs bits to match vanilla's save format, a reason Blockyland doesn't have |
| WebAssembly mesher, SharedArrayBuffer | SharedArrayBuffer needs COOP/COEP headers, which put share links and third-party loads at risk. A worker without SharedArrayBuffer is enough |
| Guest-message validation audit | Already done in `src/multiplayer/shareProtocol.js` |
| Signed releases and code-owner review of the pipeline | Horizon pushes automatic updates to installed launchers. Blockyland is a web page behind `npm run test:preflight`, so there is nothing installed to tamper with |
| Version porting, decompilation tools, `.hmod` content mods | They depend on Mojang's jars and Horizon's native mod system |

## Order and tracking

Work goes one item per commit and in this order, because items 1 and 2 make every later item cheaper to test and
review. Each item ends with its own tests passing and, before any push, `npm run test:preflight`.

| # | Item | Depends on | Status | Decision needed from you |
| --- | --- | --- | --- | --- |
| 1 | Choose tests from the change | none | Done | none |
| 2 | Agent map in AGENTS.md | none | Done | none |
| 3A | Provenance, LICENSE, disclaimer, public-tree check | none | Done | MIT, decided 2026-11-01 |
| 5 | Pin data sources | none | Done | none |
| 4 | MCP agent control | 1 (to test it) | Done: AI Settings replaced, vendor code removed, npm package built (not yet published) | Publish blockyland-mcp to npm; a Gemini API key to test Gemini CLI |
| 7 | Parity ledger | 2 | Not started | none |
| 6 | Meshing on a worker | the measurement in step 1 | Not started | Go or no-go after the measurement |
| 3B | Non-Mojang default textures | 3A | Not started | Whether to replace the default look, and when |

Item 5 is placed early because it is small and nothing depends on it.

## Progress

### 2026-11-01: items 1, 2 and 3A

Nothing here is committed yet. The new and changed tests pass, and so does `npm run test:preflight`. When
committing:

- `.gitignore` ignores `docs/`, so this file needs `git add -f docs/IMPROVEMENT_PLAN.md`.
- The `AGENTS.md` map names the Biome Inspector (`src/biomeInspector.js`, `src/biomeInspectorSession.js`,
  `biome-inspector.html`, `e2e/biomeFeatures.pw.js`). Those files are another piece of uncommitted work, so commit
  them first or together. Otherwise `tests/agentsMap.test.js` fails in a clean clone.

#### 1. Choose tests from the change: done, with a different default

| File | What it does |
| --- | --- |
| `scripts/testGraph.mjs` | Builds the import graph of `src/`, `tests/`, `server/`, `scripts/`, `functions/` and `cloudflare/` (1,410 files, about 250 ms). It reads static imports, `export ... from`, literal `import()` and `new URL('...', import.meta.url)` workers. It walks back from each changed file to the tests that reach it, and also picks tests that quote the file's name (tests that read `index.html` or `src/main.js` as text) |
| `scripts/testSlots.mjs` | Machine-wide slots: a `slot-<n>` folder under the OS temp folder per running test run, with stale-owner takeover. A run waits while other runs hold slots and less than 2 GB is free |
| `scripts/test.mjs` | New options: `--changed`, `--files a,b`, `--base <ref>`, `--depth <n>`, `--deep`, `--max <n>`, `--yes`, `--no-repeat`, `--no-slots`. Every run, group runs included, now takes a slot. New group `tooling` |
| `tests/testGraph.test.js`, `tests/testSlots.test.js` | A fixture tree with a re-export, a cycle, a helper, a worker and a test that reads `index.html`. The expected selections are worked out by hand from the layout |

How it differs from the plan:

- **The nearest tests run by default, not everything reachable.** The graph is dense: `blockGeometry.js` and
  `world.js` import `bed.js`, and most tests import one of them, so 307 of 514 tests can reach `bed.js`. Horizon
  narrows by which Rust items a probe can reach, which a regex graph can't do. Each test therefore gets its distance
  from the change. By default each changed file runs its nearest tier, and `--depth 2` or `--deep` adds more. The
  output says how many tests it left out.

  | Changed file | Nearest (default) | `--depth 2` | `--deep` |
  | --- | --- | --- | --- |
  | `src/bed.js` | 7 | 115 | 307 |
  | `src/creeperBehavior.js` | 2 | 117 | 306 |
  | `src/multiplayer/shareProtocol.js` | 9 | 32 | 32 |
  | `src/mesher.js` | 32 | 37 | 38 |
  | `src/world.js` | 102 | 136 | 163 |
  | `src/blocks.js` | 370 | 446 | 457 |

- **Reach stops at hubs.** A module importing more than 100 others (today only `src/main.js`, with 144) doesn't pass
  reach on, so `--deep` doesn't run every test that boots the game.
- **A size cap instead of a prompt.** Agents can't answer a prompt, so more than 60 files is refused unless `--yes`
  is passed, and the refusal shows the first 20 rows.
- **`--files` was added.** Several agents share one checkout, so `git diff` also shows other agents' edits. With
  `--files`, an agent names only its own files. `AGENTS.md` recommends it.
- **Flake gate:** a changed or new test file runs 3 times. This is checked: `--files tests/testSlots.test.js` ran it
  3 times.
- **Not cached.** Building the graph takes about 250 ms, so a cache wasn't worth it. A first version used a regex that
  matched the whole `import {...} from` clause, and it backtracked for over two minutes on long generated files. The
  patterns now anchor on a fixed word and a quote, and a test checks that 900 KB of input parses in under 1 s.

#### 2. Agent map: done

- `AGENTS.md` gained:
    - the `--changed`/`--files` instructions;
    - the slot rules;
    - how to check a failure on a clean `HEAD` worktree (with the Windows long-path pitfall);
    - "Write tests with signal";
    - **Where things live**: how `main.js` is organised, plus a 29-row table of area → main files → unit tests →
      page/e2e/docs, ordered by commits in the 60 days to 2026-11-01;
    - the asset rules.
- `tests/agentsMap.test.js` checks every path (more than 80) and every test group in the table. On its first run it
  caught three wrong film paths in the draft.

#### 3. Asset provenance and licensing: Phase A done

| Change | Detail |
| --- | --- |
| Non-affiliation notice | `#start-legal` on the title screen (`index.html`, `src/style.css`): "Blockyland is an independent fan project. It is not affiliated with, endorsed by or associated with Mojang Studios or Microsoft. Minecraft is a trademark of Mojang Synergies AB." It is pinned to the bottom of the screen, and below the buttons on short windows. Checked in Chrome at 1280×800 and 800×600 |
| `public/assets/PROVENANCE.json` | Written by `scripts/seed-asset-provenance.mjs`, which compares each file's git blob hash with the PrismarineJS/minecraft-assets trees of 15 versions (cached in `.cache/asset-provenance/`). Reruns produce the same file and keep entries confirmed by hand |
| `scripts/checkPublicTree.mjs` | Fails on `.jar`, `.class` or `.java` anywhere, on any file on disk under `public/assets/` with no provenance (the build copies git-ignored files too), and on provenance entries for files that are gone. It is step 0 of `scripts/preflight.mjs`, so the pre-push hook runs it (about 0.3 s). Tested in `tests/publicTree.test.js` |
| `THIRD_PARTY_NOTICES.md` | Textures, data, code dependencies and their terms. `README.md` now points to it instead of a `docs/licenses/` folder that never existed |

What the provenance check found in the 5,308 files under `public/assets/`:

| Source | Files | Meaning |
| --- | --- | --- |
| `vanilla` | 1,868 | Mojang's textures, byte-identical to PrismarineJS minecraft-assets (mostly `data/1.21.4`) |
| `vanilla-derived` | 1,257 | `packs/faithful_64x/`: made by `scripts/generate-faithful-64x.py`, which upscales the vanilla block textures. **It isn't the Faithful community pack**: the plan was wrong about this, and is corrected above |
| `unknown-modified` | 368 | Named like vanilla textures but different: edited, script-made replacements, or another version |
| `unknown` | 558 | No vanilla name. Mostly icons that `scripts/generate_*` and `scripts/compose-*` build, many from vanilla textures |

So about 3,100 shipped files are Mojang's art or made directly from it, and the other 926 haven't been checked one by
one. This is the starting point for Phase B.

### 2026-11-01: decisions on the open points of item 3A

| Decision | Change |
| --- | --- |
| MIT license | `LICENSE` (MIT, © 2026 PeterPanOnGit and the Blockyland contributors), with a note that Mojang's textures and data, and the files made from them, are not covered. `"license": "MIT"` added to `package.json`. `README.md` and `THIRD_PARTY_NOTICES.md` point to it |
| Replace the font | `fonts/Minecraft.otf` (author and license unknown) is deleted. [Pixelify Sans](https://github.com/eifetx/Pixelify-Sans) replaces it (SIL Open Font License 1.1, from Google Fonts): `fonts/PixelifySans.ttf`, a variable font covering weights 400–700, with its license in `fonts/PixelifySans-OFL.txt`. The font family is now named `'Pixelify Sans'` everywhere it was `'Minecraft'`: `src/style.css` (`@font-face` and 35 uses), `src/mods/dragonball-tournament/style.css` (20), the Bed Wars and SkyWars UIs, canvas text in `src/mobs.js`, `src/multiplayer/remotePlayerManager.js` and `src/mods/bedwars/visuals.js`, and the films (`src/cinema/civOverlay.js`, `civFilm.js`, `wedFilm.js`) |
| New provenance source | `third-party`, with `from` and `license` fields. The seeder keeps hand-written entries and all their fields on reruns |
| Reword the page description | `<meta name="description">`: "Blockyland is a free voxel sandbox game that runs in your browser: explore generated worlds, mine, craft and build, meet villagers and fend off monsters, and share your world with friends. Nothing to install." (was "High performance Minecraft replica in browser...") |
| Reword the F3 overlay | "Blockyland (WebGL)" (was "Minecraft 1.20.2 (WebGL Browser Edition)") |

Checks: the nearest tests for the changed files (55 files, 702 tests) pass, except the two failures that are already
on `HEAD`. `npm run test:preflight` passes.

Incident: removing the temporary `HEAD` worktree with `git worktree remove --force` followed its `node_modules`
junction and deleted most of the shared `node_modules`. `npm install` restored it from the lock file; its only lock
change is the new `"license"` field. `AGENTS.md` now says to delete the junction first.

Still open:

- `dumpVersionInfo` in `src/main.js` (the copy-version-info debug key) still reports
  `name = Minecraft Web Edition (three.js voxel build)`.
- Phase B: 926 assets are still `unknown` or `unknown-modified`.

Test failures that were already there: `tests/tutorialPlaytestFixes.test.js` ("right-clicking an armadillo with a
brush goes through brushArmadillo") and `tests/progressOverlay.test.js` ("pointer lock is not requested after an
await"). Both read `src/main.js` as text, and both fail the same way on a clean checkout of `HEAD` (91bd033).

### 2026-11-01: item 4, Agent Control (MCP)

The Agent Terminal's AI Settings are replaced. The vendor, model, API key and key-vault drawer is gone. Offline Mode
now chooses between two modes:

- **ON** (the default): the built-in presets answer, as before.
- **OFF**: the player's own AI app answers. That can be Claude Code, Gemini CLI, Codex, Cursor or any MCP client,
  connected in a new **🔌 Connect AI** panel. No API key enters the game.

The user guide is [agent-control.md](agent-control.md).

#### How it works

| Piece | File | Role |
| --- | --- | --- |
| Tool table | `src/agentControl/protocol.js` | The 9 tools, their schemas and annotations, the error kinds, the allowed page origins, the argument checks. The MCP tool list, the checks and the guide all come from it |
| MCP server | `scripts/blockyland-mcp.mjs` (`npm run mcp`) | MCP over stdio for the AI app (hand-written JSON-RPC, no new dependency), plus a WebSocket on `127.0.0.1:47615` for the game tab. Handles pairing, forwards game tools, and queues what the player types |
| Page bridge | `src/agentControl/bridge.js` | Connects out to the server only while Offline Mode is off. Shows a 6-digit code, runs forwarded tools, sends the player's messages, and re-pairs after a reload with a session token kept in sessionStorage |
| Game tools | `src/agentControl/gameTools.js` | `get_state`, `look_around`, `screenshot`, `plan_reference`, `run_plan`, `run_command`, `say`. They reuse the terminal's own machinery: `run_plan` goes through `WorldAgent.runPlan`, and `plan_reference` is the rules and schema of its system prompt |
| Terminal UI | `index.html`, `src/ui.js` (`initGemini`), `src/agentTerminalControls.js`, `src/style.css` | The two modes, the Connect AI panel (status, setup command, code, copy buttons, New code, the screenshot opt-in) and the AI's replies (`.ai-reply`) |
| Dev setup path | `server/agentControlVite.js` | On the dev server only, Connect AI shows the setup command with this checkout's script path. The production build contains no local path (checked) |

The loop an AI app runs: `connect` with the code → `plan_reference` once → `wait_for_player_message` → `look_around`
or `screenshot` → `run_plan` or `run_command` → `say` → wait again.

#### Decisions and how they differ from the plan

- **Transport:** a WebSocket from the tab to the local server, not Playwright. The goal was to control the game the
  player is playing, which Playwright's own browser can't reach. Playwright is used only by the tests.
- **Safety:**
    - The server listens only on `127.0.0.1`.
    - It refuses pages from other origins at the handshake. Allowed are `localhost`, `127.0.0.1` and
      `blockyland.online`; `BLOCKYLAND_MCP_ORIGINS` adds more.
    - A tab is used only after the AI app gives its code.
    - `run_plan` changes the world only where the terminal itself may: Creative, or cheats on.
    - `run_command` keeps each command's own permission.
    - `destroy`/`clear` plans and `/fill`, `/setblock`, `/clone`, `/kill` and `/clear` need `confirm: true`.
    - Screenshots go to the AI app only while the player allows them.
- **Shipping:** it's in the public build, off by default. The page contacts `127.0.0.1` only after the player
  switches Offline Mode off. You hadn't decided between public and dev-only. Opt-in seemed the safe middle;
  removing `https://blockyland.online` from `PUBLIC_ORIGINS` makes it dev-only.
- **The vendor code is kept but unused.** `agentProviders.js`, `agentKeyVault.js`, `agentModelCatalog.js` and
  `WorldAgent`'s vendor methods are still there, with their tests. The UI forces `offlineMode` so a key saved by an
  older version is never used. Deleting them is a follow-up, once MCP has proven itself.
- **`/offline`** now switches the terminal's mode, and opens Connect AI when it turns the AI app on.
- **Fixed along the way:**
    - Chat labelled the agent's messages with the stored vendor (for example "✦ [DeepSeek]"), even for offline
      presets. A `chatLabel` now says "World Agent", or the AI app's name during its plans.
    - Builds no longer pause between batches while the tab is hidden. A hidden tab's timers slow to once a second,
      so a build started from another window crawled.

#### Tests

| Test | What it proves | Result |
| --- | --- | --- |
| `tests/agentControlServer.test.js` (13) | MCP handshake and version negotiation, the tool list, argument checks, pairing by code, forwarded calls and images, the player-message queue and its timeout, reload re-pairing, the origin refusal, a busy port | Pass |
| `tests/agentControlBridge.test.js` (6) | The page bridge against the real server: finds it, pairs, runs tools, sends messages, finds a server that starts later, re-pairs after a reload, New code and disable | Pass |
| `tests/agentControlTools.test.js` (13) | On a real `WorldAgent` in a flat world: build and destroy, block by block; confirm; the Creative/cheats rule; busy; commands and their permissions; say; screenshots and the opt-out; look_around; plan_reference; the chat label | Pass |
| `tests/agentControlDocs.test.js` (2) | The guide's tool table matches `TOOLS` exactly | Pass |
| Updated: `agentTerminalControls`, `domWiring`, `commandParity` (`/offline`) | The two modes, the new panel's elements, no key fields left | Pass |
| `e2e/agentControl.pw.js` (3, `npm run test:agent-control:browser`) | A real browser with clicks and the C key, plus the real server and a scripted MCP client. Covers the whole loop (gold pillar checked in the world, a real JPEG, the player's message with its screenshot, the answer in the terminal, `/weather`, confirm, Offline Mode disconnecting), an AI app quitting and coming back with the same code, and the offline presets | Pass |
| `npm run test:preflight` | Including the new panel on the start-screen click suite | Pass |

The new unit tests passed three runs in a row (the runner's flake gate).

#### Live test with Claude Code (local dev server)

`scripts/agent-control-live.mjs` (`npm run test:agent-control:claude`) starts its own dev server on port 3028, plays
the player in Chrome and runs `claude -p` with only the Blockyland server. Both runs used Claude Code 2.1.316 with
`claude-opus-5-5`:

| Request typed in the game | Turns | Time | Cost | What Claude did |
| --- | --- | --- | --- | --- |
| "build a small cobblestone watchtower, about 6 blocks tall, right next to me" | 16 | 99 s | $0.84 | Connected, read the reference, built, and checked with screenshots. Its first two towers came out floating (see below), so it destroyed them with `confirm` and rebuilt on the ground: a 5x5 tower with a door, ladder, windows and battlements. Then it answered in the terminal |
| "put a small oak bench and two lanterns in front of me" | 20 | 95 s | $0.76 | Placed them with `/setblock`, checked each with a screenshot, and answered in the terminal |

Found by the live runs and still open:

- **Builds placed in the air.** `near_player` placement (`WorldAgent.calculateSafePlacement`, unchanged and also used
  by the old vendor AI) put the tower at y=32 with the player at y=25, among the trees. Claude worked around it with
  `offset`. Fix the ground detection, or let `run_plan` take an absolute origin.
- **`/setblock` has no block states.** `oak_stairs[facing=south]` fails as "Unknown block".
- **Players without a checkout** can't run `scripts/blockyland-mcp.mjs`. Publishing it as an npm package
  (`npx blockyland-mcp`) would give them a one-line setup.
- **Other AI apps.** Gemini CLI and Codex are the next to try. `scripts/agent-control-live.mjs` would need their
  command lines.

#### Test failures not caused by this change

| Test | Cause |
| --- | --- |
| `tutorialPlaytestFixes`, `progressOverlay`, `systemsWikiAudit` | Fail the same way on a clean checkout of `HEAD` |
| `gameBlockStates` ("SUNFLOWER_STALK") | Another agent's uncommitted sunflower work; passes on `HEAD` |
| `shareServer` | Fails only in one shared process with other files. Passes alone, and alongside all the Agent Control tests |

When committing: `.gitignore` ignores `docs/`, so `docs/agent-control.md` needs `git add -f`, like this file.

### 2026-11-02: the npm package, the old API removed, and Gemini CLI

#### The npm package `blockyland-mcp`

Players need only Node.js 18+, and no checkout: `claude mcp add blockyland -- npx -y blockyland-mcp@latest` (with
`cmd /c` before `npx` on native Windows). The guides are [agent-control.md](agent-control.md) and the package's own
[README](../packages/blockyland-mcp/README.md), which is its npm page.

| Change | Detail |
| --- | --- |
| `packages/blockyland-mcp/` | `server.mjs` (moved from `scripts/blockyland-mcp.mjs`), `protocol.js` (moved from `src/agentControl/protocol.js`), the `blockyland-mcp` command in `bin/`, README and MIT license. It depends only on `ws`, and the name was free on npm on 2026-11-02 |
| One copy of the code | `src/agentControl/protocol.js` and `scripts/blockyland-mcp.mjs` now only re-export the package, so the game, a checkout and the npm package run the same code |
| The command | `--help` and `--version`. Run by hand in a terminal, it explains that the AI app starts it. Its MCP `serverInfo.version` is the package version |
| A version check | The game compares its `PROTOCOL_VERSION` with the server's. Connect AI then tells the player which side to update (restart the AI app, or reload the page) |
| Connect AI | Shows the `npx` command; the dev server still shows this checkout's script |
| Test selection | `scripts/testGraph.mjs` now reads `packages/` too, so a change to the server selects its tests |
| `tests/mcpPackage.test.js` | Checks that the package ships every file it imports, needs nothing but `ws`, that `npm pack` holds exactly the 6 files, that the command answers `--help`, `--version` and an MCP handshake, and that the game and the package share one tool table |
| Publishing | The "Publishing the npm package" section of agent-control.md. Needs `npm login` as the owner of the name, then `npm publish --access public` from `packages/blockyland-mcp/` |

Checked with a real Claude Code, its server started through `cmd /c npx` from the packed tarball, exactly as a
Windows player's setup runs it: "put a torch on top of the nearest tree" was done and answered in 23 s, for $0.50.

**Not yet published:** this machine isn't logged in to npm. Until it is published, `npx -y blockyland-mcp@latest`
fails, and players need the checkout route.

#### The old API-key code is removed

| Removed | |
| --- | --- |
| `src/agentProviders.js`, `src/agentKeyVault.js`, `src/agentModelCatalog.js` | Vendor requests, the encrypted key vault, model lists |
| From `src/worldAgent.js` (about 1,100 lines) | Vendor settings, `queryLanguageModel` and the streaming client, retries and failover, staged builds (`build_in_stages`, which needed the in-game model; a large build is now several plans) |
| From `src/agentPlans.js`, `src/agentCapabilities.js`, `src/agentHistory.js` | Staged-plan validation; advice for vendor failures (rejected key, no credit, rate limits); request and response capture |
| Tests | `agentProviders`, `agentKeyVault`, `agentModelCatalog`, `claudeProvider`, `thinkingStream`, `planRecovery`, `answerShapes`, `stagedBuild`, and the vendor parts of `agentGuidance`, `agentHistory`, `geminiAgent`, `studioBugs` |
| Scripts and CSS | `scripts/test-agent-key-vault.mjs`, `scripts/preview-agent-terminal.mjs`, the `test:agent:vault*` npm scripts, and 27 CSS rules for the vendor drawer |

Kept and moved:

- The screenshot encoder is now `src/screenshotEncoding.js`.
- The vendor tests that guarded real behaviour now run through Agent Control instead. They cover:
    - the AI being told the player is indoors;
    - an edit to "the room I'm in";
    - invented structure ids in Building Studio;
    - build, edit and destroy keeping the player's own edits;
    - invalid plans changing nothing.
- Offline answers that said "add an API key" now say to switch Offline Mode off and use 🔌 Connect AI.
- `src/agentControl/forgetOldKeys.js` wipes the keys and vendor settings older versions saved in the browser (plain
  and encrypted), and keeps Agent Control's own settings and the turn history. Tested in `tests/forgetOldKeys.test.js`.
- `README.md` now describes the AI app and `npx` setup instead of vendor keys.

Fixed, found while moving the tests: when an AI app built something with Building Studio open, the build wasn't
loaded into the studio. Only the terminal's own presets did that. `run_plan` now does it too, and tells the AI app.

Checks:

- The 115 test files these changes reach: 1,382 of 1,387 tests pass. The 5 failures come from elsewhere:
    - `progressOverlay`, `tutorialPlaytestFixes` and `splashPotion` (2) also fail on a clean checkout of `HEAD`;
    - `durability` fails only when it shares a process with other test files.
- The Agent Control browser tests (3) and `npm run test:preflight` pass.

#### Gemini CLI

`scripts/agent-control-live.mjs --ai gemini` runs Gemini CLI 0.66 (through npx) instead of Claude Code. For
safety, it trusts only the Blockyland server and excludes the shell and file-writing tools, rather than using YOLO
mode. **It couldn't be tested on this machine:** Google refused the cached personal Google login with "This client is
no longer supported for Gemini Code Assist for individuals… migrate to the Antigravity suite of products". Gemini CLI
still works with a Gemini API key from Google AI Studio (`GEMINI_API_KEY`), so the test needs one:
`GEMINI_API_KEY=... node scripts/agent-control-live.mjs --ai gemini`. The guides now say this.

Also fixed in the live script:

- On Windows, a prompt passed as an argument was split at its spaces.
- A finished run's dev server could still answer the next run. The script now checks that the port is free, and
  waits for its own cleanup.

### 2026-11-02: following a request, and a small terminal

You found that the status bar didn't say when the AI app had finished, and that the Connect AI steps filled the
terminal (the log was one line high).

| Change | Detail |
| --- | --- |
| A status line for each request | `src/agentControl/requestTracker.js`: sent → working (what it is doing, from each tool call: "building Garden fence", "running /weather rain", "looking at your view") → **done**, or stopped if the AI app disconnects. Elapsed time is shown throughout. The header pill reads `SENT 3 s`, `WORKING 42 s`, `DONE ✓` or `STOPPED` |
| A clear "Done" | Done when the AI app goes back to waiting for the next request. The server now tells the game (`ai_waiting`); it is additive, so older servers still work. Also done when it answered and then stayed quiet for 8 s, for an app that ends its turn without waiting again. The log adds "✓ Done: Claude Code finished “…” in 1 min 12 s." with a chime, and chat says so too if the terminal is closed. After 30 s with no pickup it suggests asking the app to wait for requests |
| Foldable setup steps | The steps fold to one line ("✓ Connected to Claude Code (code 430936)…") when the app connects and when a request is sent. **▾ Show steps** / **▴ Hide steps** toggles them, and they unfold again on a disconnect |
| The small terminal | **▁ Small** docks a 460-pixel panel in the bottom-left corner and clears the dimmed backdrop, so the world shows while the agent builds; **⤢ Large** restores it. The choice is remembered. The transparent layer still catches clicks, so a stray click can't reach the game while the terminal is open |

Tests:

- `tests/requestTracker.test.js` (6): the states, both "done" signals, the slow-pickup hint, disconnects, signals
  arriving out of turn, and the wording.
- `tests/agentControlServer.test.js` (+1): the `ai_waiting` signal, and that a queued message doesn't trigger it.
- `tests/agentControlBridge.test.js` (+1): each tool call, with its arguments, is reported before it runs.
- `tests/domWiring.test.js`: the new elements.
- `e2e/agentControl.pw.js`: in a real browser, checks the working line ("Claude Code — Working: running /weather
  rain", `WORKING n s`), then done (status line, `DONE ✓`, the log entry), folding and unfolding the steps, and the
  small terminal (at most 460 px wide, docked left, transparent backdrop, remembered). It saves screenshots of both
  sizes.

All pass, including three runs in a row through the flake gate.

### 2026-11-02: Building Studio starts empty and watches only a file it saved or opened

Building Studio used to reopen the last `.schem` file on entry, and to poll the whole studio folder from the start.
Now:

- **Entering the studio gives a new, empty world.** No earlier file is reopened: the stored "last file" record and
  `restoreActiveFile` are gone. The studio still finds its folder (`connectSource`), so Save and Open work. The
  status reads "Save or Open a .schem file to watch it".
- **Nothing is watched until the player saves a file into the folder or opens one from it**, and then only that file
  (`watchActiveFile`). `SchematicWatcher` has a new `only` option, so other files in the folder are never read.
- **Saving as a download, or opening a file from elsewhere on the computer, watches nothing.** Before, opening such a
  file kept watching the previous one, whose next change would have replaced what the player had just opened.
- The watcher's default timer no longer keeps Node alive, so a test that saves can't hang the test run.

Tests, all passing 3 of 3:

- `tests/studioSchematicWatch.test.js` (+4): the `only` option reads only its file; entering with files in the folder
  watches and reopens nothing; Save watches only the saved file; opening from the folder watches it, and opening from
  elsewhere stops watching.
- `tests/buildingStudio.test.js`: Save watches only the saved file.

Checked in a real browser against the dev server, with 15 files in `build_studio_schematics/` and an old "last
file" record in storage:

- On entry: no build, nothing placed, not watching, and no folder requests over 3 s.
- After Save: only the saved file is watched (2 polls a second).
- The test file was removed again afterwards. `npm run test:preflight` passes.

Unrelated failure: `gameBlockStates` ("SUNFLOWER_STALK", another agent's uncommitted work).

### 2026-11-01: item 5, pinned data sources

- `data-lock.json` pins minecraft-data (bd8b5c6, follows master), minecraft-assets (6c571b0, follows master) and
  misode/mcmeta (277751c, the 1.21.4-data tag). `scripts/dataLock.mjs` builds every URL from the lock (`rawUrl`,
  `contentsUrl`, `treeUrl`, `pin`); `node scripts/dataLock.mjs --update <name>` moves a pin.
- 13 scripts now fetch through it, including `generate-mc-data`, `build-vanilla-pack`, `generate-mob-spawn-data`,
  `fetch-misode-fixtures`, the download and block-parity scripts, and `seed-asset-provenance`.
- Checked: the five minecraft-data inputs at the pinned commit are byte-identical to the cache the committed data
  came from.
- Found and fixed: `src/blockHarvestData.js` and `src/foodData.js` held hand edits that a regeneration would have
  deleted. These were the crafter's pickaxe, the post-1.21.4 harvest rows, the snow-layer row and the ominous bottle
  not counting as food. They now live in `scripts/generate-mc-data.mjs`, and regenerating gives the committed files
  back, identical apart from line endings.
- `tests/dataLock.test.js` (group `tooling`) passes 3 of 3. It fails on any pin that isn't a full SHA, and on any
  script that reaches these repositories without going through the lock.

Not started: item 6 (meshing on a worker), item 7 (the parity ledger), removing the old vendor/API-key code, and the
Gemini CLI live test.
