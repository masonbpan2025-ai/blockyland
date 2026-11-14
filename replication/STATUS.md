# Replication status (checkpoint log)

Read [`PLAN.md`](PLAN.md) for the plan. This file is the checkpoint: the current phase, what is done, what is next,
and how to resume. Update it at the end of every work step.

## How to resume

1. Read this file top to bottom, then `PLAN.md`.
2. Continue from **Next step** below.
3. If a game run was in progress: see **Run state** (save folder, how to restart the server and agents).

## Current phase

**P6: dry run / cost gate** (P1-P5 done 2026-11-03: server, Mineflayer-style client, part tests, harness). Waiting for the user to approve launching the agents.

## Where things are (2026-11-03)

- `replication/server/engine.js`: the multi-dimension server on `Game.prototype` (dimension objects + player contexts,
  per-player partition of mobs/items). `bridge.js`: what clients are sent (state, entities, chunks, block changes,
  messages) and every action (dig, place, activate, use/release, attack, inventory moves, toss, craft, furnace, chest,
  chat). `page.js` + `../server.html`: the page; `launch.mjs`: Vite + headless Edge; `run.mjs`: the server process
  (pull loop at 20 Hz, bots, runners, HTTP `/run` `/status` `/events`, `--dev` adds `/page` to eval in the page).
- `replication/client/`: `bot.js` (Mineflayer-style bot with its own world mirror), `pathfinder.js`
  (mineflayer-pathfinder API: goals, Movements, goto/setGoal/stop; walk, step, drop, dig, tower, bridge, swim),
  `runner.js` (vm per player, persistent globals, allowed requires, timeout without kill + late output),
  `registry.js` (minecraft-data stand-in), `vec3.js`, `bl.mjs` (the agents' CLI: `bl run file.js --timeout 60`).
- Verified 2026-11-03 through the CLI: find logs, pathfind, dig (3 s by hand, vanilla), collect drops, recipesFor,
  craft planks/table/sticks, place the table, craft a wooden pickaxe at it.
- Start a dev server: `node replication/server/run.mjs --run=replication/runs/dev --players=Ada,Bo --dev`, then
  `BL_PLAYER=Ada node replication/client/bl.mjs run prog.js`.

## Part tests (P4), `node replication/tests/parts.mjs [ids]`

Parts in `replication/tests/parts/NN-id.js` (a program + `/* setup: */` fixture + `// timeout:`); report in
`replication/tests/report.json`. As of 2026-11-03: helpers, wood, stone, smelt pass; night/bed/death/food being fixed;
portal (08) written; 09+ (fortress, endermen, eyes, stronghold, End, dragon, saves) to write.

Fixes made while testing (game code): `src/mobs.js` Drowned passed its name as the hit position; `src/player.js`
swimmers can climb out onto a one-block bank (Java LivingEntity.travel), tests in `tests/waterMovement.test.js`.
Server: vanilla-server reach (6 blocks, no line of sight) for dig/place/activate/attack; deaths logged with cause and
respawn moves the player to the Overworld; advancements named and broadcast; multiplayer sleep (all Overworld players);
per-player portal managers; eyes of ender fly to the nearest real stronghold (no chat bearing); world time wraps with
day count and sky darkness per dimension.

Known differences to document in the write-up: world height 64; the game auto-steps 1.05 blocks on the ground (vanilla
0.6); a timed-out program keeps running (as Mineflayer) and its late output is shown
next time.

## P5 harness (written 2026-11-03, not yet run)

- `replication/agent/launch.mjs --run=run1 [--hours=30] [--model=claude-opus-5-5]`: supervises the server (restarts
  from the latest save) and four Claude Code agents (Aria, Basil, Corin, Delphi), each in a workspace under
  `~/blockyland-agents/<run>/<Name>` with CLAUDE.md (paper-style instructions, `replication/agent/CLAUDE.template.md`),
  `docs/api.md` (`replication/agent/docs/api.md`), private memory, team shared memory, and a `bl` CLI bound to its own
  bot by a token. Least privilege: Bash only for bl/git/ls, file tools in the workspace + shared memory, WebSearch;
  the game's source and other workspaces denied. Resumes each agent's session on restart. Transcripts in
  `replication/runs/<run>/agents/<Name>/`.
- The first attempt (shell unrestricted, acceptEdits, 40 h) was blocked by the safety classifier; the current version
  is least-privilege. Launching it needs the user's go-ahead (cost gate).
- Saves: `replication/server/saves.js`; the server writes `saves/latest.json.gz` every 5 minutes (SAVE_EVERY), and
  `--restore=latest` resumes.

## Architecture update (2026-11-03 evening)

- Each player's client (bot + pathfinder + runner) now runs in its own worker thread (`replication/server/botWorker.mjs`);
  a watchdog (WATCHDOG_S, default 30 s) restarts a client whose program blocks it; the agent is told its globals were
  lost. Verified: a `while (true) {}` in Bo's program left Ada unaffected; Bo's client restarted after 10 s.
- Server errors are rate-limited in the log (1, 10, 100, then every 1000th): an earlier per-tick error flooded the
  log and slowed the world to ~1 tick/s.
- Recording for the film: `replication/runs/<run>/recording/frames.jsonl` (2 Hz: players + visible entities) and
  `blocks.jsonl` (every block change with tick and dimension).
- Dashboard at `http://127.0.0.1:<port>/dashboard`; pause/resume need the token in `runs/<run>/admin.json`.

## Part results (2026-11-03, late)

12/15 parts passing before the last fixes: wood, stone, night (kills on Easy), bed (sleep + spawn point), death (drops,
bed respawn, recovery), Nether portal (built, lit, travelled), fortress (blaze rod), enderman (pearl), eye of ender
(rises ~10, flies ~15 toward a stronghold 1.46 km away, heading error 0°), saves (0 blocks differ, positions and
inventories exact). Fixed since: smelt/food interference (a timed-out program kept steering the next part: the runner
now resets clients between parts), stronghold fixture (scan the whole stronghold; eyes now aim at the stronghold's
start, as vanilla), dragon test (must see "Free the End"; an Enderman killed the player in the End last time).

More game bugs fixed on the way: `src/main.js` handleRightClick read an undefined `it` before spawn eggs, so placing a
bed (and any item right-click past that point) threw a ReferenceError in the real game too. Test-suite note:
`tests/contentGap.test.js` and `tests/creakingParity.test.js` fail in the working tree but pass on HEAD with my
changes applied: the failures come from other uncommitted work in the tree.

## Big finding: strongholds were not generated

The game's default structure list (`src/worldStructures.js` WORLD_STRUCTURE_IDS) has no strongholds (the game builds a
portal room beside the spawn instead), so eyes of ender pointed at nothing real. The replication server now enables
`REPLICATION_STRUCTURES` (`replication/server/engine.js`): the default list + stronghold + the four other village types +
the overworld ruined portals. Verified: the nearest stronghold (start 196,20,1428) has its portal room at y 8-15 with
stone bricks, iron bars, lava, a silverfish spawner and 12 frames (1 pre-filled). The game's own default is unchanged
(a decision for the user: report it).

Also: `activateItem` is now use-in-air (clears the clicked block/mob, as Mineflayer), so eating while facing a furnace
eats instead of opening it; `bot.activateEntity` added; a client-restart race that lost the inventory resend is fixed.

Held-keys bug (fixed): releasing all controls set `player.botControls = null`, but Player.update copies botControls
into keys only while set, so the last keys stayed pressed and players walked on after their program let go (the cause
of every "drift" seen in the part tests). Now an empty object is sent and keys are reset.

## Weather (2026-11-04)

The server now runs Blockyland's weather (it had a clear-sky stub). One world-wide clock (Java durations: rain on 12000-24000 /
off 12000-180000 ticks, thunder on 3600-15600 / off 12000-180000), the Overworld's WeatherManager ticking gameplay only
(`WeatherManager.tickGameplay`, split out of update()), chunks within 8 of a player for lightning and snowfall, rain and
thunder darkening the sky for spawning, lightning hitting any player (`game.players`), saved with the world, and
bot.isRaining/rainState/thunderState/'rain' for the agents. Game parity fixes (wiki Thunderstorm/Lightning, Java
findLightningTargetAround): strike region 3 below to 9 above; natural lightning targets a living entity under open sky
within 3 blocks (a rod first); lightning damage is its own type ("was struck by lightning"). Tests: 6 new in
`tests/weatherParity.test.js` (50 pass); part 15-weather (thunder at noon: 63 daytime monsters, natural lightning, rain
stops at its timer with the rain event); part 14-save now checks weather and compares with the saved data.

## P4 result (2026-11-03, night)

Every part has passed through the API at least once (failures between runs are combat/world randomness: a night
fight lost, an enderman that dropped no pearl, a lava death in the portal room): wood, stone, smelt, night, bed,
death, food, portal, fortress, enderman, eyes, stronghold (frames filled, End entered), dragon (crystals broken by
arrows; the full fight was not finished by the test bot in 14 min: the paper's team needed 14 h), dragonkill
(crystals removed + dragon at 12 HP by fixture: 11 arrows kill it, "Free the End" logged), save/restore (exact).
Long programs: the CLI and test runner use node:http (fetch gave up after 300 s).

## Dry run sonnet30 (2026-11-04): 4 x Sonnet 5.5, 30 min of game time

Run folder `replication/runs/sonnet30/` (recording, events, transcripts, programs, memory snapshots every 2 min,
workspaces copied at the end, `digest.md`). Result: all four reached Stone Age and iron pickaxes; Corin first iron pick
5:37 and 3 diamonds at 7:05, then died in lava at y 1 (lost them); Aria ended best equipped (iron sword, pickaxe,
helmet, bucket; no deaths); 11 deaths in all (Delphi 7 in one night); no Nether. Teamwork: Basil proposed roles in chat
and kept `shared/plan.md`; locations, dangers and lessons were shared; failures reported honestly.

Fixed after it:
- **Runaway programs** (the cause of most deaths: a timed-out program kept steering its player, through deaths):
  `bl stop` stops every running program (actions fail, movement released, its listeners removed; helpers on `global`
  keep working), a death stops all programs, every output lists programs still running (`replication/client/runner.js`,
  AsyncLocalStorage per program; `run.mjs` `/stop-programs`; `botWorker.mjs`; `bl.mjs stop`). Docs: `api.md`,
  `CLAUDE.template.md`. Tests: `tests/replicationRunner.test.js` (group agent); checked end to end on a dev server.
- Lava/fire damage now carries its type (`src/heat.js`, `src/entities.js`): lava deaths were "died (generic)".
- Launcher: the clock starts when the server is ready; hard stop at the deadline with a final save; memory snapshots;
  workspaces copied; agents get only their workspace settings and no MCP servers (`--setting-sources project
  --strict-mcp-config`). The agent workspaces must be trusted once in Claude Code (the user did this for sonnet30).
- Agents' docs: a Minecraft vs Blockyland height table (`api.md`); README "Known limits" names the height difference.

Film: `replication-film.html` (`src/cinema/replicationFilm.js`, edit `src/cinema/replicationEdit.js`, data from
`node replication/film/build.mjs <run>`, voices `node scripts/narrate-replication.mjs`), registered in
`scripts/render-film.mjs` as `agent-expedition`. The user runs the `--publish` render.

## Run sonnet30b (2026-11-04): the same 30 minutes with `bl stop`

Run folder `replication/runs/sonnet30b/` (same seed; workspaces reused with `--workspaces=sonnet30`). 28.8 min of game
time (the computer slept for an hour mid-run; the game paused with it). 9 deaths (run 1: 11), none from runaway
programs (run 1: about 8); `bl stop` used 10 times by all four. 3 iron pickaxes; diamonds for Aria (lost) and Basil
(kept); Basil ended with an iron sword, pickaxe, chestplate, bucket and a diamond. 6 deaths in one cave by spawn
(about 10, 14-18, -6): agents went back alone for their kit; no chat at all, only shared notes.

Fixed after it:
- **Enderman melee reach ignored height and walls** (`src/mobs.js`): one in that cave hit Aria on the surface 10
  blocks above it. Now 3D with `meleeCanReach` (reach -1.8 to +2.9 blocks in height, no hit through blocks); 4 tests
  in `tests/endermanParity.test.js`. Mob group: 2075 pass.
- **Teamwork**: a "Working as a team" section in `CLAUDE.template.md` (report deaths with place and cause in chat and
  `shared/dangers.md`; check dangers before trips; do not go back alone or unprepared; help each other); the dead
  player is told where they died (engine.js, as Minecraft's death screen); `bl news` shows new chat and messages
  without running a program; the launcher seeds `shared/README.md` and `shared/dangers.md`. Tested in
  `tests/replicationRunner.test.js` and end to end on a dev server.

## Collision fixes (2026-11-04, from the user's review of the film)

- **A block could be placed inside another player or a mob** (`src/main.js` `placementBlockedByOthers`): the game
  checked only the placer's box. Basil's suffocation in run sonnet30 was Delphi pillaring up on top of him: the dirt
  under her feet went into his head. Now refused ("a player or mob is in the way") for blocks with a collision shape,
  as Minecraft's Level.isUnobstructed. Tests: `tests/placementObstruction.test.js`; end to end on a dev server.
- **Players passed through each other** (`src/entityPush.js`, called each tick in engine.js): Java's Entity.push
  (0.05 per tick, scaled by 1/sqrt of the offset), as a position nudge that never enters a block. Tests:
  `tests/entityPush.test.js`; on a dev server two overlapping players were 0.63 apart after 2.5 s.
- Film only: a cutaway lost its rock cuts after the first block change in a shot (`replicationFilm.js` keep list
  dropped the flag), so Corin looked buried in rock; he never was (his cells were air in the recording).
- Already failing on HEAD, not from these changes: progressOverlay (pointer lock), splashPotion (2), tutorialPlaytestFixes
  (armadillo). durability.test.js fails only inside a large batch; alone it passes 3/3.

## Dry runs (P6, 2026-11-04)

- `sonnet30` and `sonnet30b`: 4 × Sonnet 5.5, 0.5 h each, worked: ~150-165 programs, 22-23 advancements (iron tools,
  armour, diamonds), 9-11 deaths (skeletons, drowning, endermen, falls, fire). Open issues: in `sonnet30b` the 0.5 h
  limit fired ~55 min late (13:51 due, 14:47 actual; the machine may have slept), and Delphi's session kept ending
  after ~1 min (five times in a row).
- `dry3`: aborted after 2 min. Fresh workspaces are untrusted, and Claude Code then ignores the 13
  `permissions.allow` entries (deny still applies). Use `--workspaces=sonnet30` (trusted) or trust new folders first.
- `dry4` (started 2026-11-05 00:38Z): `--workspaces=sonnet30` after moving the old notes, scripts, `.session` files
  and shared memory to `~/blockyland-agents/archive-sonnet30b` (also backed up in `runs/sonnet30b/workspaces`).
  Agents run programs fine; they sometimes chain shell commands, which need approval and are refused, then retry
  one at a time. At 29 min: 206 programs, 22 advancements, 9 deaths; Delphi handed Basil a diamond pickaxe.
- Short sessions explained: an agent ends its headless turn after finishing a sub-task and writing a summary
  (Delphi: 5 turns, "gave Basil a diamond pick", code 0). Not a crash, but the launcher then idles 60 s (sessions
  under a minute) before resuming. Possible fix: a shorter pause for clean exits, or a CONTINUE prompt that says to
  keep playing rather than report.
- dry4 final: 213 programs, 22 advancements, 9 deaths (baseline deaths per 0.5 h: 11, 9, 9).
- `--tactics=flee` (launcher option, off by default; added 2026-11-05 at the user's request): a section in each
  agent's CLAUDE.md telling them to run from hostile mobs and call for help in chat, with a guard on `global` that
  every moving/digging program starts (on `health` drop with a hostile within ~8 blocks: stop, sprint away, chat,
  end the program), and to answer teammates' calls. This is game strategy, which the paper did not give its agents:
  a run with it is not a faithful replication. `dry5` (started 2026-11-05 ~01:20Z) tests it against dry4 (same seed,
  model, length).
- dry5 (flee) result: 1 death (an arrow) vs 9 in dry4, but 95 programs vs 213 and 16 advancements vs 22: the agents
  did less. 15 programs installed the health guard; no one called for help.
- `--tactics=book` (2026-11-05, user's request): a full playbook, `replication/agent/docs/strategy.md`, copied to each
  workspace's `docs/` and pointed to from CLAUDE.md: the route by phase, ten Never rules (from Minecraft guides and the
  dry runs' deaths: digging down, lava, drowning, falls, night, endermen, low health, long programs in danger, two
  programs at once, rushing back), combat with flee and call for help, branch mining and obsidian, roles, buddy
  system, help protocol, sleeping together, the End fight. Also game strategy (not a faithful replication). `dry6`
  (started ~2026-11-05) tests it, same seed and model.
- dry6 (book) result: 191 programs, 22 advancements, 9 deaths (Corin 7: drowned twice in the same water cave; 3
  spiders in 30 s waiting for dawn at 5 HP then respawning into them; 2 skeletons at the spawn point at dusk. Basil 2:
  zombie while mining at night "no guard"; drowned making obsidian in flowing water "no oxygen guard"). The agents
  read the book and used its teamwork parts (roles, buddy, COMING, escorts, gear drops), but rarely turned its safety
  rules into code (health guard: Aria 1, Basil 6, Corin 0, Delphi 0 programs). No beds by night 1 (one sheep found).
- **Harness bug (dry6): Delphi's bot client stopped answering for ~23 min** (`bl run/eval/news/stop` hang, `bl status`
  works; the watchdog did not restart it), after `bl run sheep.js --timeout 100`. Delphi ran 14 programs. Fix before
  any further comparison.
- dry6b (rerun of dry6) was stopped by the user's request at start (2026-11-05 12:29Z).
- **Cause found:** a program's un-awaited action that failed (`bot.attack` on a gone/out-of-reach mob) was an
  unhandled rejection, which ended the client's worker thread; the watchdog skipped dead clients, so every `bl` call
  hung. Delphi (04:33) and Corin (04:45: its last 5 deaths happened with no control of its bot). Fixed:
  `botWorker.mjs` reports unhandled rejections/exceptions as late output; `run.mjs` restarts a client whose thread
  exits. Verified on a dev server.
- Launcher: clean session ends resume after 5 s (60 s backoff only for quick failures); CONTINUE prompt says to keep
  playing, not stop to summarise.
- **Safety kit** `replication/agent/kit/safety.js` (with `--tactics=book`, copied to `kit/` in each workspace; agents
  told to `bl run kit/safety.js` first thing): reflexes (flee + HELP at <=12 HP / creeper / 2+ hostiles / unarmed, hit
  back otherwise; swim up at air <=8; out of lava; eat at food <=14) and `global.safe` helpers (`goto` with safe
  movements, `dig` refusing lava/water-adjacent, falling-block and under-feet digs, `status`, `setHome`, `fled`).
  Tests: `node replication/tests/kit.mjs` (6/6 pass). Playbook: section 0 (the kit, await every action) and Never
  rules 11-13 (no waiting out the night in the open or at low health; beds before the first night; get safe after
  death).
- `dry7` (2026-11-05): book + kit + fixes. 284 programs, 3 deaths (all Corin), no client crashes, HELP/COMING used
  10 times. But progress stalled after 12 min (best: iron pickaxe; no diamonds): the server process ran out of memory
  at 8 min (exit 134) and restarted from a save 3.5 min older, all four clients were restarted by the watchdog (it
  blamed them for a server stall), and then the team was passive and hungry: everyone sealed in for the whole night
  (~15-24 min), Basil at 2 HP with no food for 12 min, Aria at 1-4 HP (bogged poison), no beds (sheep scarce), an
  unlit base ringed by mobs at dawn.
- Server fixes: each client worker has its own heap cap (CLIENT_HEAP_MB, 1536): a runaway program ends only its
  client (restarted); the watchdog blames only a client that was sent packets and did not ack them for 30 s; the
  server logs `server_stall` (a pull >5 s) and `slow_pull` (>1 s). Verified on a dev server (runaway allocation: only
  Ada restarted; busy loop: only Bo restarted; server up). The OOM's trigger is not identified yet: watch for
  `server_stall` in the next runs.
- Playbook: food first (cook 8+ meat on day one), eat to full when hurt, light the base, spend the night mining
  underground or working in the base (not idle), don't over-hunt sheep, check for waiting mobs at dawn; bring food
  to a hurt teammate now. Kit: eats also when hurt (<16 HP) and food <18. Kit tests 6/6.
- `dry8`: book + kit + all fixes above. **2 deaths, 352 programs, 24 unique advancements, all 4 iron pickaxes**, no
  crashes or stalls, 19 HELP/COMING; but no diamonds (baselines: 7-19 min). Lost time: item hand-offs by tossing in a
  crowd (wrong players picked them up, ~3 min of chat); skeletons in natural caves (both deaths, most HELP calls); the
  kit ate raw meat ("no food left (kit ate it)").
- Comparison table (deaths / programs / unique advancements / iron picks / first Suit Up / first Diamonds!):
  sonnet30 11/165/22/4/13.9/7.1; sonnet30b 9/153/23/3/24.4/19.3; dry4 9/213/22/2/14.7/13.8; dry5 1/95/16/1/-/8.6;
  dry6 9/191/22/2/7.7/19.2; dry7 3/284/17/1/-/-; dry8 2/352/24/4/15.0/-.
- Fixes for dry9: kit eats cooked food first, raw only at food <=6, never raw chicken; reflex rushes an archer within 8
  blocks (above 12 HP, armed) and flees one farther away. Playbook: hand-offs through chests; mine in your own tunnels
  and block cave openings; two players go for diamonds at y 12 as soon as they have iron pickaxes; shields block only
  when raised.
- `dry9`: **void.** The account's 5-hour usage limit was hit 2 minutes in (all four agents share the operator's plan,
  and so does any Claude Code session the operator runs alongside); every session after that ended at once with
  "You've hit your 5-hour limit", for 28 minutes (14 programs, 0 advancements). The launcher looked for limits only on
  stderr; it now reads the transcript's `rate_limit_event` and waits until `resetsAt` (verified on dry9's transcripts).
  The dry9 fixes (kit food and archers, chest hand-offs, own tunnels, early diamonds) are untested: rerun as `dry10`.
- Fixes before dry10 (2026-11-05/06): kill and meal advancements credited to the acting player (`engine.as`, test
  `replication/tests/credit.mjs`; dry8's five misattributed ones corrected in `film/build.mjs` CREDIT); kit v2: when
  hurt it stops the running programs, draws the best weapon, FIGHTs or RUNs by gear (table in strategy.md section 3),
  walls in (HOLD) when the run gets nowhere, and answers teammates' HELP with COMING (armed, 14+ HP, within 32 blocks;
  two helpers for archers), CLEAR or BACKING OFF; `bl` exits 3 and the runner holds new programs until `bl news` after
  a kit takeover or a death (tests: `tests/replicationRunner.test.js`, `tests/blCli.test.js`,
  `replication/tests/kit.mjs` 17 checks).
- `dry10-sonnet`: **void** (usage limit 8.5 min in, all four idle until the reset). `dry10-sonnet2` (Sonnet 5.5) and
  `dry10-haiku` (Haiku 5.5), same seed, book + kit v2, 30 min each, sequential (`scratchpad dry10-pair.mjs`):

  | | dry8 (Sonnet) | dry10-sonnet2 | dry10-haiku | dry10-gemini2 (Gemini 3.8 Flash) |
  | --- | --- | --- | --- | --- |
  | deaths | 2 | 5 (4 drowned, 1 fall) | 1 (fall) | 0 |
  | programs | 352 | 487 | 431 | 264 |
  | advancements (player x title) | 24 | 31 | 21 | 25 |
  | first iron pick / Suit Up / Diamonds | 8:59 / 14:57 / - | 20:32 / - / 27:37 | 12:23 / - / - | 15:41 / - / 16:30 |
  | HELP / COMING / CLEAR or BACKING OFF | 16 / 0 / 0 | 14 / 8 / 1 | 13 / 13 / 12 | 5 / 4 / 1 |
  | programs stopped by the kit / held | - | 21 / 6 | 24 / 7 | 10 / 0 |
  | median gap between programs | 8.5 s | 5.3 s | 5.7 s | 6.8 s |
  | median distance to nearest teammate | 9.2 | 14.3 | 3.1 | 11.4 |

  Haiku huddled at the base (helpers always in reach, fewer milestones); Sonnet spread out (more progress, solo
  deaths; 11 "CAN'T HELP: no stone sword", 7 "CAN'T REACH"); Gemini 3.8 Flash (`dry10-gemini2`, 30 min, 4 subagents)
  had 0 deaths, reached `Sweet Dreams` (10:30), 2 iron pickaxes (Aria 15:41, Delphi 16:50), 9 diamonds (Aria 16:30,
  diamond pickaxe & sword at 17:34), `Monster Hunter` (Delphi 17:18, Basil 19:33), and `Ice Bucket Challenge` (Aria
  28:16). Kit bugs both Claude runs exposed: the RUN reflex is raw
  sprint+jump, it ran players into water (Corin, dry10-sonnet2) and off a roof (Basil, dry10-haiku): it must use the
  pathfinder with safe movements; the HELP names the nearest hostile (a phantom overhead) rather than the archer.
  Films: `replication-film-dry10-haiku.html`, `replication-film-dry10-sonnet.html`, `replication-film-dry10-gemini.html` (renders `agent-expedition-dry10-*`).
- Phantoms in dry10-haiku were not vanilla: 42 from 900 s, 28 by day, 16 at once (Sonnet's team slept at 907 s and
  saw none). Two bugs: the server ran the spawn update once per player each tick (world-wide timers 4x fast: time
  since rest reached 72000 after 18000 ticks), and a second, older phantom spawner in `src/hostileMobBehaviors.js`
  ignored night and any cap. Fixed (2026-11-06): the old spawner removed; `PhantomMechanism` keeps each player's time
  since rest (reset by that player's sleep or death); `engine.js` runs `spawnManager.update` once a tick with every
  player of the dimension (`D.spawnManager.players`). Tests: `tests/phantomSpawning.test.js` (+4),
  `tests/tutorialPlaytestFixes.test.js` (per-player reset), `replication/tests/credit.mjs` (+3: timers once a tick
  with two players). `tutorialPlaytestFixes`' "armadillo with a brush" fails on the working tree's uncommitted
  `src/main.js` edits (another change), not on these.
- Kit v2.1: RUN is a path (pathfinder, no drop over 3, `noWater`), never a blind sprint; then HOLD if it got nowhere.
  Pathfinder fixes (`replication/client/pathfinder.js`): a step onto water's surface and a diagonal over water were
  free of `liquidCost`; new `noWater` refuses water outright. `safe.goto` no longer drops any depth into water. HELP
  names the archer, not a phantom overhead. `replication/tests/kit.mjs` 19 checks (pit and pond runs fail on the old
  kit, pass 3/3 on the new).
- `dry11-haiku`: 1 hour of Haiku 5.5 with all of the above (`scratchpad dry11.mjs`, log `replication/runs/dry11.log`).

## Films of runs (P8 pipeline)

- Each run's film has its own edit: `src/cinema/replicationEdit.js` (sonnet30), `src/cinema/replicationEditDry8.js`
  (dry8, "The Agent Expedition: Rematch", 4:58, 34 scenes, every quote verbatim from the run). The page names the run
  (`replication-film-dry8.html`: `<body data-run="dry8">`); `replicationFilm.js` loads the edit from `EDITS`.
- Steps for a run: `node replication/film/build.mjs <run>`; write the edit from `runs/<run>/digest.md`; add it to
  `EDITS` in `replicationFilm.js` and `scripts/narrate-replication.mjs`, a page, and a `FILMS` entry in
  `scripts/render-film.mjs`; `node scripts/narrate-replication.mjs --run=<run>` (OpenAI voices; `--tts=edge` free);
  `node scripts/render-film.mjs --movie=<film> --preview` (storyboard + continuity check); then the full render.
- Camera fixes (2026-11-05): a shot whose players are under a rock roof becomes a cutaway automatically, and so does one
  no lens sees clearly; every frame cuts the rock still between the lens and the players (`clearView`); close-ups follow
  the facing smoothed over 2 s; deaths are held on screen 3 s (the server logs the respawn in the death's tick); the
  film implements `pilot.check` (lens or player inside a block, player hidden), run every 0.5 s by the full render.
  dry8: 597 frames checked, clean.
- Machine memory was down to ~1.5 GB free during dry4; Claude Code reaped a background watcher for low memory (the
  run itself, in its own window, was unaffected). About 15 leftover ~50 MB node processes were running at the time.

## Next step

Before the real run: decide the next length and model (the user's call), then
`node replication/agent/launch.mjs --run=<name> --hours=<h> --model=<model>` (new run names need their workspaces
trusted once). Earlier plan text follows.

P6: dry run of the harness. Cost gate: ask the user first. The launcher should run in the user's own terminal (long
jobs get reaped in Claude's background shells):
`node replication/agent/launch.mjs --run=dry1 --hours=0.5 --model=claude-sonnet-5-5`, then the real run
`node replication/agent/launch.mjs --run=run1 --hours=30`. Watch: dashboard `http://127.0.0.1:7790/dashboard`,
`replication/runs/<run>/launcher.log`, `events.jsonl`, the agents' transcripts. Then P8, the film, from
`replication/runs/<run>/recording/`.

## Earlier next step (done)

Build the server as a headless browser page (`replication/server/`), so the game's own `Game.prototype` methods run
unchanged: one shared state per dimension (world, mobs, entities, spawner, furnaces, chests, farming, End encounter),
one player context per agent (`Object.create(Game.prototype)` with its own player, inventory, camera, UI stub),
mobs/items/arrows updated per player on the slice nearest to each player. A Node front (`replication/server/run.mjs`)
launches the page, takes programs from the agents' CLI over HTTP, writes saves and the event log, serves the dashboard.
First milestone: one player context in an Overworld that can break a log with `breakTargetBlock` and pick it up.

## Log

- 2026-11-02: Read the paper (abstract and HTML). Wrote PLAN.md. First evaluation: the survival, Nether, stronghold
  and End content exists; the major gaps are a headless multi-dimension server, a Mineflayer-compatible API, the
  program runner and CLI, and disk saves. World height is 64 (Minecraft 384).
- 2026-11-02: P1 desk check (`CAPABILITIES.md`). New gaps: the game builds an End portal room 48 blocks from spawn
  with 2 eyes filled (`Game.placeEndPortalRoom`), and a thrown eye aims at that room and prints its bearing in chat
  (`Game.throwEnderEye`). Real strongholds do generate in rings (`worldgen/registry.js`). Decision: the server runs in
  a headless browser page and reuses `Game.prototype` methods per player (parity over a rewrite).

## Run state

No run yet.

## Decisions

- Agents: Claude Code, `claude-opus-5-5`, one per player, workspaces outside the repo.
- Bug policy during the run: small → fix live; significant → stop, fix, test, restart from the last save.

## Horizon (real Minecraft 26.3 in Rust) pilots (2026-11-06)

- Control: `horizon-ctl` (launcher install, `versions/nightly-2026-11-05-66f3981/`) plays and films the game; its MCP
  server (`horizon-ctl --socket <client>/control.json mcp`) gives agents 98 tools; agents get only the play tools
  (`replication/horizon/pilot2.mjs` PLAY list). Server: `replication/runs/hz-pilot/server` (127.0.0.1:25590, offline
  names, whitelist off, `spawn-protection` 0: non-operators cannot build within 16 blocks of spawn otherwise).
- Filming: ffmpeg gdigrab of a client window by title (rename it; keep it fully on screen; 150% display scaling makes
  a 1280x720 client 1920x1080) records 30 fps; `screenshot` manages only about 3 fps. Spectator camera: `spectate`
  plus F5 for the game's own third-person views; scripted shots (chase, orbit, drone, tripod) by `tp` + `look-at`
  about 30 times a second (`replication/horizon/pilot.mjs`).
- `pilot2` (2 Haiku agents, 4 min): both windows filmed; Aria made planks, a crafting table and a wooden pickaxe
  layout, Basil a wooden pickaxe and a shaft to stone; 60 chat lines. Both were kicked at 2:52 when another session's
  `run-active-locomotion-suite.mjs` joined the same server with the same names. Reel:
  `replication/runs/hz-pilot/pilot2/pilot2-side-by-side.mp4`. Lessons: third person is useless while a menu is open and
  clips into walls in shafts; dismiss the tutorial toast; record with `-draw_mouse 0`.
- Studio: `studio record start/stop` writes `.mcpr` (ReplayMod's format) to `%APPDATA%\horizon\recordings`; Horizon's
  Replay Studio lists them but cannot play them back (this nightly). ReplayMod 2.6.28 exists for Fabric 26.3: untested.
- Gemini's `outputs/horizon-gemini10`: scripted chat and no model calls (`replication/horizon/run-hz-gemini10-full.mjs`);
  not an agent run.
- `hz-dry10-gemini` (4 real Gemini 3.8 Flash subagents, 10 min, 2026-11-06):
  - Harness: `replication/horizon/run-hz-dry10-gemini.mjs --seconds=600` (dedicated `horizon-server` on `127.0.0.1:25596`, seed `20261103`, `spawn-protection=0`, `low_memory=true`), 4 `horizon-client` instances (`Aria`, `Basil`, `Corin`, `Delphi`, `--render-distance 3`) controlled via `replication/horizon/hz-play.mjs` (`move-to`, `mine-nearest`, `place`, real UI slot-click `craft` and `smelt` macros, `chat`), plus official Minecraft 26.3 + Fabric + ReplayMod 2.6.28 client (`Camera` in spectator mode, `--xmx=900M`).
  - Outcome (`replication/runs/hz-dry10-gemini/digest.md`): 1201 frames (`10:00`), 589 block changes, 8 deduplicated advancements (`Stone Age` for Basil, Aria, Corin, Delphi; `Getting an Upgrade` for Aria, Basil, Corin; `Acquire Hardware` for Aria), 2 active furnaces, `iron_sword` crafted & equipped by Aria at `6:46`, rapid response to Delphi's water-pocket drowning at `(15, 56, -46)` (`7:55`).
  - ReplayMod archive (`replication/runs/hz-dry10-gemini/film/recording.mcpr`, `5.48 MB` zip / `32.3 MB` `.tmcpr`) updated with 90 3D camera keyframes (`timelines.json`) via `replication/horizon/refilm-hz-dry10-gemini.mjs`.
  - Broadcast movie (`src/cinema/replicationEditHzDry10Gemini.js`, `replication-film-hz-dry10-gemini.html`): rendered at 1080p (`9657` frames, `5:22`) to `outputs/agent-expedition-horizon-gemini/agent-expedition-horizon-gemini.mp4` and `public/movies/agent-expedition-horizon-gemini.mp4`.
