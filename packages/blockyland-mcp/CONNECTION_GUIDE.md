# Agent connection guide: which guideline to follow

Four ways an AI app can connect to Blockyland. Read this first, then open the guide for the case you want. Each case
folder holds one sub-folder per agent (`deepseek/` today; other agents add their own), because the *case* is shared but
the recipe is not - ports, process names, scripts and wording differ per agent.

```
packages/blockyland-mcp/
  CONNECTION_GUIDE.md                                   <- you are here
  agent_terminal_connection_guide/gemini/README.md      case 1 (Gemini): drive the player's own tab
  agent_terminal_connection_guide/deepseek/README.md    case 1 (DeepSeek): drive the player's own tab
  base_game_connection_guide/gemini/README.md           case 2 (Gemini): join a shared world as a player
  base_game_connection_guide/deepseek/README.md         case 2 (DeepSeek): join a shared world as a player
  skywars_connection_guide/gemini/README.md             case 3 (Gemini): SkyWars lobby as a player
  skywars_connection_guide/deepseek/README.md           case 3 (DeepSeek): SkyWars lobby as a player
  bedwars_connection_guide/gemini/README.md             case 4 (Gemini): Bed Wars match as a player
  bedwars_connection_guide/deepseek/README.md           case 4 (DeepSeek): Bed Wars match as a player
```

## 1. Pick the case

| The player asks for | Case | Guide |
|---|---|---|
| "build / edit / decorate / destroy <thing>", "run this command", "change the weather/time", "answer me in the terminal" | **1. Agent Terminal** - the AI drives the player's own tab | `agent_terminal_connection_guide/{gemini,deepseek}/README.md` |
| "join my world", "come and play with me", "help me build this house", co-op in a shared survival/creative world | **2. Base game guest** - a second player in the host's world | `base_game_connection_guide/{gemini,deepseek}/README.md` |
| "join my SkyWars lobby", "play SkyWars against me", "loot/bridge/fight" | **3. SkyWars guest** - a competitor with an island | `skywars_connection_guide/{gemini,deepseek}/README.md` |
| "join my Bed Wars match", "pick a team", "break their bed", "defend with me" | **4. Bed Wars guest** - a teammate/opponent on a team | `bedwars_connection_guide/{gemini,deepseek}/README.md` |

If the request mixes them ("join my world and build me a castle"), the honest split is: **case 2 to be a body in the
world** and **case 1 to build at plan scale** - they are different connections and can run at the same time, because they
use different transports (47615 vs the share service).

## 2. How the four differ

| | 1. Agent Terminal | 2. Base game | 3. SkyWars | 4. Bed Wars |
|---|---|---|---|---|
| MCP tool that starts it | `connect` `{code}` | `join_game` `{code}` | `join_game` `{code}` | `join_game` `{code, team}` |
| Code | **6 digits** (Connect AI panel) | 4 digits (share room) | 4 digits (lobby) | 4 digits (lobby) |
| Game-side transport | WebSocket **127.0.0.1:47615** to the tab | share service `/ws/share` | share service `/ws/share` | share service `/ws/share` |
| Needs the Agent Terminal open? | **yes** (C, Offline Mode off) | no | no | no |
| Who is authoritative | the tab (it is the player) | the host's browser | the host's browser (match rules) | the host's browser (match rules) |
| What the AI controls | plans, commands, screenshots | a player body | a player body with an island | a player body on a team |
| Main tools | `get_state`, `look_around`, `run_plan`, `run_command`, `say`, `wait_for_player_message` | `guest_status`, `guest_act` | `guest_status`, `guest_act` (loot, bridge, attack) | `guest_status`, `guest_act` (team, farm, buy, bed) |
| Ends with | closing the client | `leave_game` | `leave_game` | `leave_game` |
| Can it build with plans? | **yes** | no (block by block only) | in play, no plans | no plans |

## 3. Cross-cutting rules

- **One owner per port.** Only case 1 binds 47615. If another app (Antigravity, Claude Code, a stray listener) holds it,
  the terminal connection cannot start; the guest cases are unaffected. See case 1 section 7.
- **The 6-digit terminal code belongs to the tab** (sessionStorage). Restarting the client re-pairs with the same code;
  a page reload, "New code" or another tab spends it. **4-digit room codes belong to the host's session** and change
  when the host restarts the lobby.
- **Wrong codes are rate-limited** (a few a minute per address). Read codes from the game instead of guessing.
- **The host stays the authority.** Guests propose; the host validates (block edits, chat, attacks, purchases). Nothing a
  guest sends is applied unchecked.
- **Names**: `join_game` takes `name` (<= 24 chars) so several bots can coexist; `guest_status`/`guest_act` take it back
  to address one of them.
- **Progress updates.** Case 1 has a dedicated tool for them: `report_progress {message, progress?}` - it shows in the
  terminal and the AI app without ending the request (`say` is what ends it). Guest cases report progress by acting:
  the host sees the guest move, build and fight.
- **Never disconnect another agent.** Rooms and the terminal port are shared ground. Three concrete traps, all seen:
  1. **Do not kill by command-line pattern.** A filter like `mcp-join`, `agent-control-client` or `blockyland-mcp`
     matches *file names*, and other agents run copies of the same files - their driver dies and their guest drops.
     Record your own pid instead and stop only that id. Same for port 47615: inspect the occupant before touching it.
  2. **Use a unique guest name.** `join_game` disconnects an existing guest with the same name
     (`server.mjs`: `if (existing) existing.disconnect()`), so two `deepseek` bots fight over one seat.
  3. **Do not claim a team someone is on**, and do not re-join mid-match: in `solo` a team holds one player
     (`MODES.solo.size = 1`) and a late join gets `team: null` (Bed Wars) or `slot: null` (SkyWars), which leaves a
     stale roster entry and no way to play. Check `guest_status.players[]` first, wait for `phase: lobby`, then join once.
  Leaving is `leave_game` (your guest only) - never kill the server, which drops everyone on it. Details:
  `bedwars_connection_guide/deepseek/README.md` section 6 and `skywars_connection_guide/deepseek/README.md` section 7.
- **Do both at once** if you need to: one client paired to the tab (case 1) plus one guest in the world (case 2/3/4) is
  legitimate - different sockets, different jobs. They do not share state, so say which one is doing what.

## 4. Checklist before you promise anything

1. Terminal case: tab open, Offline Mode off, Connect AI showing a code, port 47615 free.
2. Guest case: the host is sharing, `GET http://localhost:3000/api/share/health` shows `rooms >= 1`, the code is live.
3. Guest case: read the roster (`guest_status.players[]` once joined, or ask the human) - pick a **free team** and a
   **unique name**; never evict another agent (section 3).
4. Mini-games: the lobby has a free slot, `phase` is `lobby`, and 2+ players exist before the host can start.
5. After joining: prove it with `get_state` (case 1) or `guest_status` (cases 2-4) before acting.
6. On disconnect: `say`/`control done` so the terminal is not left "working" (case 1), `leave_game` for guests.
