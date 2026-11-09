# Bed Wars connection guide (deepseek)

Case 4 of 4. See `../../CONNECTION_GUIDE.md` for which case you want. This one is: **join a Bed Wars match as a player**
- pick a team, farm generators, buy gear, bridge over, break enemy beds.

## 1. What this connects, and what it is not

Same transport as the other two guest cases: the MCP server spawns a `GuestPeerSession` that speaks the **share**
protocol to the hosting browser. The host's browser runs the match (`src/mods/bedwars/rules.js`); you are a player on a
team. It is not the Agent Terminal: no `run_plan`, no chat commands.

## 2. Requirements

- The host started **Bed Wars** from the title screen; the lobby shows a **4-digit code**.
- You need a **team**: pass `team` to `join_game`, or call `guest_act` with `choose_team` while in the lobby.
- Team ids: `red`, `blue`, `green`, `yellow`, `aqua`, `white`, `pink`, `gray` (`src/mods/bedwars/teams.js`). A mode has
  fewer teams than that (solo/doubles: 8, 3v3v3v3 / 4v4v4v4: 4, duel: 2), so read `guest_status` for the ones open.
- 2+ players (`MIN_PLAYERS = 2`) before the host can start.

## 3. Calls

```json
{"name":"join_game","arguments":{"code":"1234","name":"deepseek","team":"blue","autopilot":true,"difficulty":"normal","strategy":"defender"}}
{"name":"guest_status","arguments":{"radius":32}}
{"name":"guest_act","arguments":{"action":"choose_team","team":"blue"}}
{"name":"guest_act","arguments":{"action":"collect_resources","target":"forge","count":16}}
{"name":"guest_act","arguments":{"action":"buy","item":"wool","count":16}}
{"name":"guest_act","arguments":{"action":"buy","item":"iron_sword"}}
{"name":"guest_act","arguments":{"action":"bridge_to","team":"red","block":"wool"}}
{"name":"guest_act","arguments":{"action":"break_bed","team":"red"}}
{"name":"guest_act","arguments":{"action":"respawn"}}
{"name":"leave_game","arguments":{"name":"deepseek"}}
```

| Goal | `guest_act` |
|---|---|
| farm | `collect_resources` with `target`: `forge` (iron + gold at your base), `diamond` (middle islands), `emerald` (centre) |
| gear | `buy` with `item`: blocks (`wool`, `oak_planks`, ...), tools (`stone_sword`, `iron_pickaxe`, ...), armour, team upgrades and traps (paid in diamonds) |
| travel | `goto` (`bridge:true` to place blocks over gaps), `bridge_to` with `team` or `position` |
| fight | `attack` with `target` (player id/name) and `count` |
| win | `break_bed` with `team` - after that the enemy cannot respawn |
| recover | `respawn` (5 s, `RESPAWN_SECONDS`) while your bed stands |

## 4. What happens, step by step

1. `join_game` with `team` (or `choose_team` afterwards) puts you on that team's island: a **bed**, a **forge**
   (iron and gold), and your team's wool/clay/glass.
2. The host starts: **5-2-1** (`COUNTDOWN_SECONDS = 5`). Your bed being intact is what lets you respawn.
3. In play, generators produce: iron and gold at your forge (faster as the forge levels up, `FORGE_SPEED`), diamonds on
   the islands between bases (~30 s at tier I), emeralds in the middle (~65 s). Standing within ~1.8 blocks takes the
   item (`PICKUP_REACH`); teammates within 3 blocks share a forge pickup.
4. `guest_status` reports the match: `phase`, `round`, `mode` (solo / doubles / threes / fours / duel), teams, beds,
   your team, and the **shop catalog** with prices for your mode.
5. Breaking a bed removes that team's respawn. Last team standing wins; a team with no players and no bed is out.

## 5. What the agent can and cannot do

| Can | Cannot |
|---|---|
| choose a team, farm, buy, bridge, fight, break beds, respawn | choose the **match's** difficulty, mode or pace (host only, in the lobby) |
| see the shop catalog and its prices from `guest_status` | buy something the shop does not sell, or pay with resources it does not hold |
| play with an autopilot brain at `easy`/`normal`/`hard` | respawn after its bed is destroyed |
| leave and rejoin between matches | keep its team if the host restarts the match (it is re-seated) |

## 6. Do not disconnect another agent (read this before joining)

A room usually has more than one bot in it: the host's own player, other agents' guests, sometimes another copy of this
template. Joining must never cost someone else their seat. These are the ways it can happen, all seen in practice:

| Do not | Why it hurts someone else | Do this instead |
|---|---|---|
| kill processes by command-line pattern (`mcp-join`, `agent-control-client`, `blockyland-mcp`, `mcp-connect`) | a pattern matches **file names**, and another agent runs a copy of the same files - their driver dies and their guest drops | record your own pids (e.g. `node_modules/.dsh-tmp/guest.pid`) and `Stop-Process -Id <that pid>` only |
| kill whatever holds a port to "free" it | port 47615 belongs to the Agent Terminal case; another agent's client may own it | check the occupant's command line and parent first; if it is not yours, use a different port (`--port`) instead of killing it |
| join with a name that is already in the room | `join_game` disconnects an existing guest with the **same name** (`server.mjs`: `if (existing) existing.disconnect()`) | use a unique name per agent, e.g. `deepseek-<n>` or the agent's own name |
| claim a team someone is already on | in `solo` a team holds one player (`MODES.solo.size = 1`); `chooseTeam` refuses a full team, so the seat is not taken - but rejoining in a loop races them for it, and a re-join **replaces your own** previous guest | read the roster first and take a free team (the join `team` argument then `choose_team`), or ask the human which team is free |
| re-join while `phase` is `playing` to "get back in" | a late join is **not seated**: the newcomer gets `team: null` and cannot play, and the roster ends up with a stale entry for the previous guest | wait until the lobby resets (`phase: lobby`) and then join once |
| kill the server to leave | that drops every guest on that server, not just yours | `leave_game` `{}` - it removes only your guest, by name |

Check before acting:

```json
{"name":"guest_status","arguments":{"radius":8}}
```

`players[]` in its answer is the roster with `name`, `id` and `team`. That is the authoritative list of who is here.

## 7. Gotchas

- **Money is items**: resources are `iron_ingot`, `gold_ingot`, `diamond`, `emerald` in the inventory. `guest_status`
  shows what you hold; `buy` needs enough of the right one.
- **Prices differ by mode**: solo/doubles use the cheap list, 3v3v3v3 / 4v4v4v4 and duel the dear one
  (`shop.js`, `prices: 'small' | 'large'`).
- **Tools and armour survive death; swords do not** (you respawn with a wooden sword). Do not re-buy a pickaxe
  you already own.
- **Team upgrades are team-wide and paid in diamonds** - they help your human teammate too.
- **`autopilot` defaults to true.** For a controlled build/defend plan set `"autopilot": false` (or
  `{"action":"autopilot","enabled":false}`).

## 8. Verify, disconnect & Multi-Agent Coexistence

- Verify: `guest_status` -> `bedwars.team`, `teams`, `beds`, `shop`, plus position/health/inventory.
- Disconnect: `leave_game` `{"name": "deepseek"}`. (Always pass `name` so other agents connected to the match are not disconnected).
- Never kill all `node.exe` processes or run indiscriminate cleanup scripts, as other agents or supervisor scripts (`mcp-supervise.mjs`) may be running concurrently.

## 9. Where the code is

`src/mods/bedwars/rules.js` (phases, timers, generators, win conditions), `src/mods/bedwars/teams.js` (teams + modes),
`src/mods/bedwars/shop.js` (prices, tools, upgrades), `src/mods/bedwars/arena.js` (islands, beds), and
`packages/blockyland-mcp/guestPeer.js` for the guest player that performs these actions.
