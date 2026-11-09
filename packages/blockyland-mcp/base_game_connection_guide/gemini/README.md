# Base Game Guest Connection Guide (Gemini / Antigravity)

Case 2 of 4. See `../../CONNECTION_GUIDE.md` for which case you want. This one is: **join a shared world as a second player**
- an AI-controlled player body that walks, mines, places blocks, chats, and builds alongside the human host.

---

## 1. What This Connects

```
Gemini AI --stdio MCP--> blockyland-mcp (server.mjs) --ws://localhost:3000/ws/share--> Host's Browser Tab
                                                        (ShareSession Protocol v5, guestPeer.js)
```

- **A real player avatar**: Spawned with body, position, health, inventory, armor, and collision. The host sees the avatar in the world and in the player list.
- **Not the Agent Terminal**: A guest player does not use `run_plan`, cannot execute administrative slash commands (`/give`, `/fill`), and does not control the host's view. For architectural builds via plan DSL, use Case 1 (`agent_terminal_connection_guide/gemini/`).
- **Host authority**: The host tab validates all block placements, resource collections, and attacks (`src/multiplayer/shareProtocol.js`).

---

## 2. Requirements

1. **Host sharing the world**: In Blockyland, press **M** or click **Share World** to start sharing. Note the **4-digit room code** (e.g. `8789`).
2. **Share service running**: Verified via `GET http://localhost:3000/api/share/health`.
3. **Valid code**: Room codes expire when the host closes the world or leaves sharing.

---

## 3. Quick Start: One-Command Join

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File packages\blockyland-mcp\base_game_connection_guide\gemini\join-base-game.ps1 -Code 8789 -Name Gemini
```

Check guest status anytime:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File packages\blockyland-mcp\base_game_connection_guide\gemini\join-base-game.ps1 -Status
```

---

## 4. MCP Tools & Actions

### Tool Calls

```json
{"name":"join_game","arguments":{"code":"8789","name":"Gemini","autopilot":false,"url":"ws://localhost:3000/ws/share"}}
{"name":"guest_status","arguments":{"radius":24}}
{"name":"guest_act","arguments":{"action":"goto","position":[12,64,8],"bridge":true}}
{"name":"guest_act","arguments":{"action":"break_block","position":[12,64,7]}}
{"name":"guest_act","arguments":{"action":"place_block","position":[13,64,8],"block":"oak_planks"}}
{"name":"guest_act","arguments":{"action":"loot_chest","position":[10,64,6]}}
{"name":"guest_act","arguments":{"action":"chat","message":"Hello from Gemini!"}}
{"name":"leave_game","arguments":{}}
```

### Action Reference for `guest_act`

| Action | Parameters | Description |
|---|---|---|
| `goto` | `position: [x,y,z]`, `bridge: true` | Pathfind to target coordinates; bridges gaps with held blocks |
| `place_block` | `position: [x,y,z]`, `block: "oak_planks"` | Place block from inventory |
| `break_block` | `position: [x,y,z]` | Mine or break a target block |
| `mine_block` | `position: [x,y,z]` | Tool-aware block mining |
| `collect_resources`| `radius: 16` | Automatically walk and pick up floating dropped items |
| `loot_chest` | `position: [x,y,z]` | Open container and transfer contents to inventory |
| `attack` | `target: "entity_id"`, `count: 5` | Attack player or mob (subject to host PvP setting) |
| `chat` | `message: "text"` | Broadcast chat message visible to all world players |
| `autopilot` | `enabled: true/false` | Toggle automated behavior engine |

---

## 5. Controlling the Guest via Queue

Write JSON objects to `node_modules/.gemini-base-tmp/base-cmd.txt`:

```json
{"action":"goto","position":[5,65,12],"bridge":true}
{"action":"place_block","position":[5,65,11],"block":"stone"}
{"action":"chat","message":"Placing stone foundation."}
```

---

## 6. Gotchas & Best Practices

- **Spawning location**: The guest player spawns 1.2 blocks beside the host.
- **Autopilot default**: `join_game` sets `autopilot: true` by default. For cooperative building tasks, pass `"autopilot": false` to prevent autonomous wandering.
- **Disconnecting**: Always call `leave_game` or write `{"tool":"leave_game"}` to cleanly remove the avatar from the host's world.

