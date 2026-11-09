# SkyWars connection guide (deepseek)

Case 3 of 4. See `../../CONNECTION_GUIDE.md` for which case you want. This one is: **join a SkyWars lobby as a player**
and compete - the agent gets an island, loots, bridges and fights.

## 1. What this connects, and what it is not

Same transport as the base game: the MCP server spawns a `GuestPeerSession` that speaks the **share** protocol to the
hosting browser (`ws://localhost:3000/ws/share`). It is not the Agent Terminal: no plans, no chat commands. The host's
browser runs the match rules (`src/mods/skywars/rules.js`); every guest is a participant.

## 2. Requirements

- The host started **SkyWars** from the title screen; the lobby shows a **4-digit code** (its own share room).
- The lobby has room for you: `ARENA.maxPlayers` islands. In the lobby you get one; late joins watch instead (see 6).
- At least **2 contenders** are needed before the host can press Start (`MIN_PLAYERS = 2`).

## 3. Calls

```json
{"name":"join_game","arguments":{"code":"5659","name":"deepseek","autopilot":true,"difficulty":"easy","strategy":"auto"}}
{"name":"guest_status","arguments":{"radius":24}}
{"name":"guest_act","arguments":{"action":"loot_chest","position":[3,31,25]}}
{"name":"guest_act","arguments":{"action":"bridge_to","position":[0,31,1],"block":"oak_planks"}}
{"name":"guest_act","arguments":{"action":"attack","target":"Player-3133","count":60}}
{"name":"guest_act","arguments":{"action":"autopilot","enabled":false}}
{"name":"leave_game","arguments":{"name":"deepseek"}}
```

| `join_game` argument | Meaning here |
|---|---|
| `code` | the lobby's 4-digit code (not the 6-digit terminal code) |
| `autopilot` | the agent plays by itself (loot, bridge, fight). Default **true** |
| `difficulty` | `easy` / `normal` / `hard`: the **agent's** speed and skill, not the match's difficulty |
| `strategy` | `auto`, `aggressive`, `rusher`, `defender`, `coop`, `pvp` |

## 4. What happens, step by step

1. `join_game` -> the lobby. You land in a **glass cage on your island** in `adventure` mode, health 20.
2. `guest_status.skywars` shows: `phase` (`lobby` / `countdown` / `playing` / `ended`), `round`, `mode`
   (`normal` / `insane`), the host's `difficulty`, the `map` (template, pack, seed), and `me` (`slot`, `alive`, `kills`).
3. The host presses Start: **3-2-1**, the cages open (`COUNTDOWN_SECONDS = 3`), everyone switches to `survival`.
4. In play the autopilot loots its island's chests, bridges to the middle, takes mid loot and fights. Chests refill at
   180 s and 360 s (`REFILL_TIMES`), the second refill adds ender pearls; the match ends at 600 s (`TIME_LIMIT_SECONDS`)
   or when one player is left.
5. `leave_game` (or the host closing) disconnects. If the match is being played, leaving **eliminates** you ('left').

## 5. What the agent can and cannot do

| Can | Cannot |
|---|---|
| loot chests, bridge, mine, place, fight, eat, use the middle | set the match difficulty, mode or map (host only: `setDifficulty`/`setMode`/`setMap` reject `by !== HOST_ID`) |
| start the match **if it is the host tab** (`start_match`) | start a match as a guest - refused by the rules |
| respawn between rounds, chat, stop/start autopilot | join a round already being played and still get an island (you spectate) |
| keep its own difficulty for the agent brain (`set_difficulty`) | change the world's difficulty in the host's save |

## 6. Rules that surprise people

- **Win = last one alive**, not most kills. When one player remains the match ends and that player wins
  (`rules.js`: `end(left[0]?.id, 'last_alive')`).
- **A kill is only credited within 10 s of your last hit** (`KILL_CREDIT_SECONDS = 10`). Knock someone into the void 30 s
  after your last hit and the survivor gets a **0-kill victory** - that is the game being correct, not broken.
- **Joining mid-match gives you no island** (`slot: null`): you are a spectator until the host resets for the next round.
  A spectator cannot loot or fight.
- **Leaving mid-match counts as dying**: `leave('left')` eliminates you and can hand the win to the other player.
- **One lobby, one code**: the code changes when the host restarts the lobby or the tab reloads.

## 7. Do not disconnect another agent (read this before joining)

A lobby usually holds more than one agent's guest. Joining must never cost someone else their seat or their island.
The ways it can happen, all seen in practice:

| Do not | Why it hurts someone else | Do this instead |
|---|---|---|
| kill processes by command-line pattern (`mcp-join`, `agent-control-client`, `blockyland-mcp`, `mcp-connect`) | the pattern matches **file names**, and other agents run copies of the same files - their driver dies and their guest drops out of the match | record your own pid (`node_modules/.dsh-tmp/guest.pid`) and stop only that id |
| kill whatever holds port 47615 | that port belongs to the Agent Terminal case; another agent's client may own it | inspect the occupant first; if it is not yours, leave it alone or use another port (`--port`) |
| join with a name that is already in the room | `join_game` disconnects an existing guest with the **same name** (`server.mjs`: `if (existing) existing.disconnect()`) | a unique name per agent |
| re-join mid-match to "get back in" | a late join gets `slot: null` (spectator) and the roster keeps a stale entry for your old guest; if the old one was alive it may already have been eliminated for you | wait for `phase: lobby`, then join once |
| leave mid-match to change something | `leave('left')` **eliminates** you and can hand the win to the other player | finish the round; change settings in the lobby |
| kill the server to leave | every guest on that server drops, not just yours | `leave_game` with `{"name": "<my_name>"}`, which removes only your guest |

SkyWars has no team seats - islands are per player - so the only way to take someone's place is a **name collision** or
killing their process. Check the roster before joining:

```json
{"name":"guest_status","arguments":{"radius":8}}
```

`players[]` is the authoritative list: `name`, `id`, `slot`, `alive`, `kills`.

## 8. Verify, disconnect

- Verify: `guest_status` -> `skywars.phase`, `round`, `me.slot`, `players` (names, slots, alive, kills).
- Disconnect: `leave_game` `{}`.

## 9. Where the code is

`src/mods/skywars/rules.js` (phases, slots, difficulty, kill credit, end conditions), `src/mods/skywars/client.js`
(what every browser does: cages, spectator, drops), `src/mods/skywars/arena.js` + `packs/` (islands), `src/mods/skywars/loot.js`
(chest contents), `packages/blockyland-mcp/guestPeer.js` (the guest player and its autopilot).
