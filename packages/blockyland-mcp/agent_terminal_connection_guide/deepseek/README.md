# Agent Terminal connection guide (deepseek)

Case 1 of 4. See `../../CONNECTION_GUIDE.md` for which case you want. This one is: **drive the player's own game tab**
- builds with plans, chat commands, answers in the Agent Terminal.

Templates in this folder: `join-agent-control.ps1` (one-command join) and `agent-control-client.mjs` (the MCP client).
Both are **templates**: copy and change what your setup needs - paths, port, process names, the code.

## 1. What this connects, and what it is not

```
game tab  --WebSocket-->  127.0.0.1:47615  <--stdio-->  client  <--queue file-->  the AI
   |                            (the MCP server, spawned by the client)
   +-- keeps a 6-digit code in sessionStorage and shows it in Connect AI
```

It is **not** a second player: no avatar, no inventory, no position. It is an interface to the tab that already exists,
so it can do what the Agent Terminal can do (plans, commands, screenshots) and nothing a player could not.

## 2. Requirements

- The game tab is open, and **Offline Mode is OFF** with **Connect AI** open (press `C`). The panel says
  "Looking for your AI app" until a server listens.
- **Port 47615 is free.** The tab dials a fixed port (`?agent-control-port=N` moves it). Exactly one owner.
- The 6-digit code from that panel.

## 3. Calls

| Tool | Why |
|---|---|
| `connect` `{code}` | pair the tab; can take ~25 s (the server waits for the tab to settle) |
| `get_state` | position, facing, mode, health, food, time, weather, held item, crosshair block |
| `look_around` | the world as text: terrain map nearby, structures, creatures, buildings this session |
| `screenshot` | a JPEG of the player's view (only if the player allowed it) |
| `plan_reference` | the plan language: actions, operations, limits, block names |
| `run_plan` `{plan, confirm?}` | build / edit / destroy / summon / give / weather / time / player_control / ... |
| `run_command` `{command}` | as if the player typed it (own permission rules apply) |
| `say` `{text}` | answer in the terminal - **ends the request** |
| `report_progress` `{message, progress?}` | a brief work update in the terminal and the AI app ("Planning the roof", `progress: 40`); does **not** end the request - use it on pickup and between steps |
| `wait_for_player_message` `{timeout_seconds}` | long-poll for what the player types |

## 4. Using the template

```powershell
# from the repository root
powershell -NoProfile -ExecutionPolicy Bypass -File packages\blockyland-mcp\agent_terminal_connection_guide\deepseek\join-agent-control.ps1 -Code 215537
powershell -NoProfile -ExecutionPolicy Bypass -File packages\blockyland-mcp\agent_terminal_connection_guide\deepseek\join-agent-control.ps1 -Status
```

| Parameter | Default | Change it when |
|---|---|---|
| `-Code` | required | the 6 digits in Connect AI (it changes after a tab reload, "New code", or another tab) |
| `-Port` | 47615 | the page was loaded with `?agent-control-port=N`; pass the same N |
| `-Status` | off | you only want to know: client alive? port taken? tab paired? |
| `-KeepOtherApps` | off | do not stop the process that respawns an occupying server |
| `-ForceOccupant` | off | the port is held by something unrecognised and you want it stopped anyway (warns, then kills) |
| `-ServerPattern` | `blockyland-mcp\|antigravity-mcp-server\|mcp-connect\|agent-control-client` | the occupant's command line does not match |
| `-RespawnerPattern` | `agy\.exe` | the occupant is respawned by another program, or never respawned (`''`) |

The client takes `--code`, `--port`, `--state <dir>` (state defaults to `node_modules/.dsh-tmp`: queue, logs,
attachments).

### Serving requests

The client parks in `wait_for_player_message`, so a request typed in the terminal reaches it in milliseconds. To act,
write one JSON object per line into `<state>/mcp-cmd.txt`; `fs.watch` runs it immediately (2 s fallback):

```json
{"tool":"report_progress","args":{"message":"Reading your request","progress":5}}
{"tool":"look_around","args":{}}
{"tool":"report_progress","args":{"message":"Building the tower","progress":30}}
{"tool":"run_plan","args":{"plan":{"action":"build","name":"Tower","dimensions":{"width":9,"height":21,"depth":9},"operations":[]}}}
{"tool":"say","args":{"text":"Done: tower at (-10, 28, 4)."}}
{"control":"done"}
```

`say` **ends** the request (that is the honest "Done in Ns"). `{"control":"done"}` ends one without answering - use it
when a request is abandoned, or the terminal stays "working" forever.

## 5. What the agent can and cannot do

| Can | Cannot |
|---|---|
| build, edit, destroy with `run_plan` (Creative or cheats on) | act without that permission: survival with cheats off refuses plans |
| run chat commands as the player | exceed the player's permissions (`/give`, `/fill` need cheats) |
| answer the player in the terminal, wait for the next request | keep working if the tab closes or reloads (the socket dies) |

## 6. The three traps

1. **`ai_waiting` means done.** The game finishes a request when the client goes back to waiting
   (`src/agentControl/requestTracker.js`). A client that waits again right after picking a request up makes the
   terminal print "Done in 0 s" with nothing done. The template waits only when idle; only `say` returns it to that.
2. **A hung tool call blocks the queue.** Queued calls run one at a time. If a call is not in the log within ~30 s,
   restart the client (cheap: see trap 3).
3. **The code belongs to the tab.** Restarting the client re-pairs automatically with the same code. The code is spent
   by a page reload, "New code", or another tab. Any edit under `src/` reloads the tab (nothing accepts HMR).

### Symptoms seen in practice

| Symptom | Cause | Action |
|---|---|---|
| `get_state` answers but `time` never advances and two screenshots are byte-identical | the tab is backgrounded or paused: `requestAnimationFrame` stops, so nothing in the world runs | bring the game tab to the front; a backgrounded tab cannot be acted on, only read |
| `get_state` reports `agentBusy: true` and `run_plan` refuses with "busy" | an earlier plan never finished (observed with `player_control` + `look at`, which hung) | press **Stop bot** in the terminal, or reload the tab; prefer `run_command` (`/setblock`, `/fill`) over `player_control` for aiming/probing |
| `/fill x y z x y z air replace air` (or `<block> replace <block>`) always answers "No blocks were filled" | the game skips a replacement that would change nothing, including same-block fills, so it cannot be used as a probe | there is no readable "is this cell air?" command: `setblock` has no `keep` mode here, and `fill` needs a block that differs. Place, screenshot, and adjust - or ask the player |
| a `setblock` landed one block off | coordinates were estimated from a screenshot | move it: `setblock … air` on the old cells, `setblock` on the new ones, then `screenshot` again to confirm (two iterations converged on a 3-wide entrance) |
| `screenshot` is refused | the player unticked "Let the AI see screenshots of my view" | use `look_around` instead |

## 7. If the port is held by another app

```powershell
$pid = (Get-NetTCPConnection -State Listen -LocalPort 47615).OwningProcess
Get-CimInstance Win32_Process -Filter "ProcessId=$pid" | Format-List ProcessId,ParentProcessId,Name,CommandLine
```

| Occupant | What to change |
|---|---|
| this template, left over | nothing; step 2 of the script stops it |
| Antigravity / Gemini (`agy.exe` parent) | nothing (default `-RespawnerPattern`) |
| Claude Code / Codex / Gemini CLI | `-RespawnerPattern 'claude\|codex\|gemini'`, or quit that app's MCP session |
| Cursor / VS Code | `-RespawnerPattern 'Cursor\|Code'` |
| published `npx` package | matches `blockyland-mcp` already; set the respawner |
| hand-written listener (e.g. `scripts/agent-terminal-listener.mjs`) | it is nobody's template: stop it yourself, or `-ForceOccupant` |
| unrelated process / `TIME_WAIT` | do not kill: `?agent-control-port=47616` + `--port 47616`, or wait |

macOS / Linux: `lsof -nP -iTCP:47615 -sTCP:LISTEN`, `kill`, then
`nohup node .../agent-control-client.mjs --port 47615 &` and queue the same JSON lines.

## 8. Verify, stop

- Verify: `-Status`, then `get_state` (2 ms) - the printed position is read from the tab, not assumed.
- Stop: `Stop-Process -Id (Get-Content node_modules\.dsh-tmp\connect.pid)`, then free the port if it is still up. The
  game shows "Your AI app disconnected"; the world and everything built stay.

## 9. Where the code is

`packages/blockyland-mcp/protocol.js` (tool table, `DEFAULT_PORT`), `server.mjs` (stdio MCP + the 47615 socket),
`bin/blockyland-mcp.mjs` (the command); page side `src/agentControl/bridge.js` (socket + pairing),
`gameTools.js` (what each tool does), `requestTracker.js` (the status line), and `src/ui.js` for the
`agent-control-port` parameter.
