# Replicating "A team of Gemini 4 Argon agents beats Minecraft" in Blockyland

Paper: Faldor, Singh, Raileanu, *A team of Gemini 4 Argon agents beats Minecraft*, arXiv:2610.22319 (Oct 2026).
Our run: four **Claude Opus 5.5** agents (Claude Code), playing **Blockyland** instead of Minecraft Java 1.20.4.

Progress, decisions and how to resume live in [`STATUS.md`](STATUS.md). Read it first.

## 1. What the paper did (the setup we must match)

| Paper | Detail |
| --- | --- |
| Players | 4 agents, one coding-agent instance each, on their own machines. A 5th agent, the **Observer**, never plays: it checks claims against the logs and flags specification gaming. |
| Goal | "Defeat the Ender Dragon, starting from the spawn of the session's shared Minecraft survival world." Any means survival mode allows. No roles assigned, no strategy given. |
| World | Minecraft Java 1.20.4, random world, survival, **Easy**, cheats off, no human input. Saved every 5 minutes; after a failure, restart from the last save (6 restarts, ~20 min paused). |
| Interface | No pixels or keys. The agent writes a short **JavaScript program**; a CLI client sends it to its **Mineflayer** bot; the program runs as the body of `async (bot) => {...}` with the pathfinder plugin loaded and **no helpers**; it can `require` Node built-ins and installed Mineflayer packages, cannot start processes or write files; values on the global object persist between programs. The client waits for an agent-chosen timeout (default 60 s) and prints logs and the return value. |
| Agent tools | Code workspace with version control, shell, file editing, web search, persistent memory (private + team-shared). Context compaction keeps work in progress. |
| Perception | Text only, through the Mineflayer API (exact blocks and entities, even behind rock). |
| Communication | In-game chat reaches every bot and appears in each player's next program output; shared memory files. |
| Instructions | A general part (observe before acting, verify after, validate new tools on short tasks, build reusable tools, record lessons, report honestly, pursue the objective without exploiting flaws) and one game paragraph (objective, how to run code, chat, logs, where the Mineflayer docs are). No game strategy. |
| Oversight | Live dashboard; researchers could pause/stop; never intervened. |
| Result | Dragon dead at 27 h 14 min; 2,783 programs, 605 deaths (69 to the dragon), 229 chat messages. Milestones: portal lit 1:42; Nether 2–11 h; 15 pearls by ~5.5 h; eye triangulation ~10:45; End portal lit 13:17; End fight 13–27 h (void-jump reset at ~17.5 h, crystals 21 h → +4:40, dragon +0:39). |

## 2. Where Blockyland stands (first evaluation, 2026-11-02)

| Need | Blockyland today | Gap |
| --- | --- | --- |
| Survival content: trees → tools → iron → diamonds, furnaces, beds, food, hunger, Easy damage | Present and parity-audited (`docs/*-parity.md`, groups `survival`, `build`). The headless arena (`arena/sim.js`) already ran World + Player + PlayerBot + inventory + crafting + PvP in Node. | World is **64 blocks tall** (Minecraft: 384); ore heights are compressed. Accept as "close enough"; document. |
| Nether: portal (obsidian, flint & steel), fortresses, blazes, ghasts, piglins, Endermen | Generators and mob parity docs exist (`fortress.js`, `blaze-parity.md`, `enderman-parity.md`); the bot can light portals. | Untested end-to-end in survival without cheats. |
| Strongholds, eyes of ender, portal room, End portal | `stronghold.js`; eyes used by `worldAgent.js`. | Eye of ender throw and flight toward the stronghold must be verified. |
| The End: dragon, crystals, cages, perch, breath, exit portal, "Free the End" | Audited in `docs/end-survival-audit.md`; an earlier session beat the dragon via Agent Control (with cheats for gear). | Simplified AI; verify it is beatable and not trivial in survival. |
| **Several players in different dimensions at once** | `World` holds one active dimension and swaps (`World.switchDimension`); multiplayer (`multiplayer/shareSession.js`) has no dimension handling. | **Major:** a headless server with one world per dimension. |
| **Mineflayer API** (`bot.findBlock`, `bot.dig`, `bot.craft`, `bot.pathfinder.goto`, events, ...) | None. `playerBot.js` has its own high-level steps; only the pathfinder's A* is vendored. | **Major:** a Mineflayer-compatible `bot` over Blockyland, with its docs. |
| Program runner, CLI client, chat in next output, timeouts, persistent globals, no process/fs | Arena had an HTTP round barrier and an MCP server, not free-form programs. | **Major:** build. |
| Saves every 5 minutes, restart from save | Browser saves to IndexedDB (`mapManager.js`, `saveSchema.js`). | **Major:** disk saves for the headless server (all dimensions, entities, containers, players). |
| Dashboard, logs, recording for the film | Arena recorder + film engine (`src/cinema/arenaFilm.js`). | Generalise: multi-dimension, ~a day long. |

## 3. Plan (phases, each ends with a checkpoint in STATUS.md)

**P1. Capability matrix.** Every step of the paper's run, mapped to Blockyland code, each marked OK / gap / unknown, with the test that proves it. Output: `replication/CAPABILITIES.md`.

**P2. Headless server** (`replication/server/`). One `World` per dimension (same seed), each with its mob manager, natural spawner, dropped items (5-minute despawn), XP, block entities (furnaces, chests, brewing), fluids, fire, day/night, weather, the End encounter. Players carry their own dimension; portals move them between worlds. 20 ticks/s in real time; chunks load around players. Difficulty Easy, cheats off. Saves every 5 minutes to disk; resumes from the last save. Event log: chat, deaths (with cause), advancements, every program and its output.

**P3. Mineflayer-compatible bot.** The subset of Mineflayer's API a survival run uses (entity/position/health/food, inventory and windows, `blockAt`/`findBlock(s)`, `dig`, `placeBlock`, `equip`, `craft`/`recipesFor`, furnace and chest windows, `attack`, `consume`, `activateItem`, `lookAt`, `setControlState`, `toss`, `sleep`, `entities`/`nearestEntity`, `chat` and events), plus the pathfinder plugin (`goals`, `Movements`, `goto`) over Blockyland's movement and the vendored A*. Docs in Mineflayer's format, listing what differs. Program runner: `async (bot) => {...}` in a `vm` context per player, persistent globals, `require` limited to Node built-ins (no `child_process`, no fs writes), timeout, captured logs and return value. CLI: `bl run <file> [--timeout 60]`.

**P4. Parity tests, part by part.** Scripted programs through the same API, no cheats, each from a prepared save: (1) wood → stone → iron tools, furnace, bed, food; (2) night survival and combat on Easy; (3) diamonds; (4) obsidian (bucket + lava), flint and steel, portal; (5) Nether travel and back; (6) fortress, blaze rods; (7) Endermen, pearls; (8) eyes of ender, throws, triangulation, stronghold; (9) portal room, End portal; (10) End: crystals (towering, caged), dragon fight, perch, breath, exit portal; (11) death, drops, despawn, recovery, bed respawn; (12) save/restore mid-game. Fix every gap; add each test to `scripts/test.mjs`.

**P5. Agent harness.** Per agent: a workspace outside the repo (git-initialised), `CLAUDE.md` with the paper's two-part instructions (general + one game paragraph, no strategy), private memory, a team-shared memory folder, the CLI, the API docs. Claude Code headless, `--model claude-opus-5-5`, tools limited to its workspace, the CLI and web search (no access to the game's source). Launcher restarts an agent that stops, resuming its session. Optional Observer agent. Dashboard page (players, dimensions, health, inventory, chat, last programs, deaths). Recorder for the film.

**P6. Dry run.** 30–60 minutes, cheaper model, to shake out harness and server bugs. Then a cost gate: confirm the budget with the user before the full run.

**P7. The run.** Four Opus 5.5 agents until the dragon dies. Bug policy: small bug → fix live and continue; significant bug → stop, fix, test, restart from the last save (log each in STATUS.md, as the paper logged its 6 restarts).

**P8. The film.** Broadcast-style movie like `arena-5v5`, two commentators, covering the whole run: milestones, deaths, strategy, cooperation, good calls and what the agents could have done better, all checked against the logs.

## 4. Risks

- **Cost and time.** The paper's run: ~27 h, ~24,000 model calls, ~1.35 B input tokens. Four Opus agents for a day is expensive; confirm before P7.
- **Fidelity.** A 64-block world and simplified mob AI make the game easier or harder in places; record every known difference in the final write-up rather than hide it.
- **Exploits.** Agents may find engine bugs that shortcut the game. The instructions forbid exploiting flaws; the Observer and our log review check for it.
