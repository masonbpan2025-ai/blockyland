# Agent Terminal Connection Guide (Gemini / Antigravity)

Case 1 of 4. See `../../CONNECTION_GUIDE.md` for which case you want. This one is: **drive the player's own game tab**
- builds with voxel plans, executes chat commands, and actively listens & responds in the in-game Agent Terminal.

Templates in this folder:
- `join-agent-control.ps1` — One-command join and verification script.
- `agent-control-client.mjs` — Persistent, detached MCP client daemon that actively listens 24/7.
- `queue-call.mjs` — Helper utility to easily queue plans, commands, and responses into the running client.

---

## 1. Architecture: The Detached Background Listener

```
game tab  --WebSocket-->  127.0.0.1:47615  <--stdio-->  Gemini daemon client  <--queue-->  Gemini AI
   |                         (Blockyland MCP server)      (node agent-control-client.mjs)
   +-- keeps a 6-digit code in sessionStorage               |
                                                            +-- parks in wait_for_player_message 24/7
                                                            +-- logs to node_modules/.gemini-tmp/messages.log
                                                            +-- executes from node_modules/.gemini-tmp/mcp-cmd.txt
```

### Why a Detached Daemon is Essential
AI coding assistants operate in **discrete conversational turns**. When a turn concludes, the assistant pauses until the user sends another message.
- If the WebSocket is held only inside interactive tool calls, pausing between turns causes the listener to go dormant.
- If the player types into Blockyland while the assistant is dormant, the game terminal times out after 15–30 seconds and warns:
  > *"Your AI app has not picked up your request yet. If it is not waiting, ask it in the app to 'wait for my requests in Blockyland'."*
- **The Solution (Option A)**: `agent-control-client.mjs` runs as a persistent, detached Node process. It stays in an unbroken `while (true)` loop with `wait_for_player_message { timeout_seconds: 300 }`. The moment the player types anything, it picks it up in **milliseconds**, logs the prompt and attachments to disk, and immediately triggers `report_progress` and `look_around` so the player sees instant feedback.

---

## 2. Requirements

1. **Game tab open**: Enter a world in Creative mode or with Cheats ON (`http://localhost:3000`).
2. **Agent Terminal configured**: Press `C` to open the terminal, switch **Offline Mode OFF**, and open **Connect AI**. Note the 6-digit code.
3. **Port 47615 free**: Exactly one server process can bind to this port (`ws://127.0.0.1:47615`).
   - If Antigravity registered `blockyland` in its internal MCP manager, unregister it once with:
     ```powershell
     agy.exe mcp remove blockyland
     ```

---

## 3. Tool Reference

| Tool | Purpose | Note |
|---|---|---|
| `connect` `{code}` | Pair with the game tab using the 6-digit code | Retries until tab connects |
| `get_state` | Read player position, facing, mode, health, food, time, weather, held items | Fast (2-10 ms) state check |
| `look_around` | Structured text representation of nearby terrain, structures, and entities | Automatically called on request pickup |
| `screenshot` | JPEG image of the player's current view | Saved directly as `img-*.jpg` on disk |
| `plan_reference` | Documentation of the Blockyland building DSL and block registry | Read before designing complex structures |
| `run_plan` `{plan, confirm?}` | Execute building, terraforming, summoning, or environment operations | Core building DSL |
| `run_command` `{command}` | Dispatch in-game slash commands (`/time`, `/weather`, `/tp`) | Subject to player cheat permissions |
| `report_progress` `{message, progress?}` | Send intermediate work updates to terminal and AI app | **Does not end** the request |
| `say` `{text}` | Output the final response in the Agent Terminal | **Ends the request** ("✓ Done in Ns") |
| `wait_for_player_message` `{timeout_seconds}` | Wait for the next player instruction from the terminal | Client parks here while idle |

---

## 4. Quick Start: One-Command Join

From the repository root:

```powershell
# Join and start persistent background listener
powershell -NoProfile -ExecutionPolicy Bypass -File packages\blockyland-mcp\agent_terminal_connection_guide\gemini\join-agent-control.ps1 -Code 434155

# Check status anytime (client alive? port bound? paired?)
powershell -NoProfile -ExecutionPolicy Bypass -File packages\blockyland-mcp\agent_terminal_connection_guide\gemini\join-agent-control.ps1 -Status
```

### Parameters

| Parameter | Default | Purpose |
|---|---|---|
| `-Code` | *Required* | The 6-digit pairing code shown in the game's Connect AI panel |
| `-Port` | `47615` | WebSocket port matching the game (`?agent-control-port=N`) |
| `-Status` | `off` | Check whether client is alive, port is bound, and tab is paired |
| `-KeepOtherApps`| `off` | Preserve competing agent processes if port is occupied |
| `-ForceOccupant`| `off` | Terminate any unknown process holding port 47615 |
| `-RespawnerPattern`| `'claude\|codex\|deepseek'` | Kills third-party respawners without affecting `agy.exe` |

---

## 5. Serving Requests & Queueing Commands

### A. How Requests Arrive
When the player submits an instruction in the terminal, the client daemon:
1. Logs the request object into `node_modules/.gemini-tmp/messages.log`:
   ```json
   {"at":"2026-11-08T16:02:05.150Z","n":1,"message":"the door is too small and I can't get in","images":1,"files":["...\\img-message-1.jpg"]}
   ```
2. Saves attached screenshots to `node_modules/.gemini-tmp/img-message-<n>.jpg`.
3. Calls `report_progress` ("Gemini is looking around...") and `look_around` immediately.

### B. Dispatching Actions
Write JSON objects (one per line) into `node_modules/.gemini-tmp/mcp-cmd.txt`, or use `queue-call.mjs`:

```powershell
# Send an intermediate progress update
node packages/blockyland-mcp/agent_terminal_connection_guide/gemini/queue-call.mjs '{"tool":"report_progress","args":{"message":"Framing the roof...","progress":40}}'

# Execute a building plan
node packages/blockyland-mcp/agent_terminal_connection_guide/gemini/queue-call.mjs my-plan.json

# Run a slash command
node packages/blockyland-mcp/agent_terminal_connection_guide/gemini/queue-call.mjs '{"tool":"run_command","args":{"command":"/time set day"}}'

# Conclude the request (stops timer on the HUD)
node packages/blockyland-mcp/agent_terminal_connection_guide/gemini/queue-call.mjs '{"tool":"say","args":{"text":"Done! Expanded the doorway to a double door."}}'

# Or cancel/abort an abandoned request without answering
node packages/blockyland-mcp/agent_terminal_connection_guide/gemini/queue-call.mjs --done
```

> [!IMPORTANT]
> `say` **ends** the current request and records the elapsed time in the game HUD.
> Once `say` runs, the client automatically re-enters `wait_for_player_message` and stays parked waiting for your next instruction.

---

## 6. The Three Traps

1. **`ai_waiting` means done**: The Blockyland request tracker interprets entering `wait_for_player_message` as completion of the request. The client only calls `wait_for_player_message` when idle; completing with `say` returns it to waiting.
2. **Hung tool calls block the queue**: The MCP client executes queued commands sequentially. If a command hangs, re-run `join-agent-control.ps1 -Code <code >` to restart the client cleanly.
3. **Code lifetime**: The 6-digit pairing code is stored in `sessionStorage` in the browser tab. Restarting the client re-pairs with the existing code; reloading the browser page or clicking "New Code" generates a new one.

---

## 7. Stopping the Client

```powershell
Stop-Process -Id (Get-Content node_modules\.gemini-tmp\connect.pid)
```

The game terminal displays "Your AI app disconnected". All placed structures and world state remain intact.
