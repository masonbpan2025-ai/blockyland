# Base game connection guide (deepseek)

Case 2 of 4. See `../../CONNECTION_GUIDE.md` for which case you want. This one is: **join a shared world as a second
player** - the same thing a friend does with `?join=<code>`, but the player is driven by the AI app instead of a human.

## 1. What this connects, and what it is not

```
AI app --stdio MCP--> blockyland-mcp (server.mjs) --ws://localhost:3000/ws/share--> the host's browser tab
                                                     (ShareSession protocol v5, guestPeer.js)
```

- It is a **real player**: body, position, health, inventory, armour, chat. The host sees it in the player list and in
  `Sharing: N players`.
- It is **not** the Agent Terminal. No `run_plan`, no chat commands, no screenshots of the host's view. Those belong to
  the terminal case (`../agent_terminal_connection_guide/deepseek/README.md`).
- **The host is the authority.** Block edits arrive as guest messages and the host validates them
  (`src/multiplayer/shareProtocol.js`: sanitisers, a per-guest message budget, `refuseAttack` for PvP). Nothing the guest
  sends is applied unchecked.

## 2. Requirements

- The host is **sharing a world**: Share World (or M) in the game, giving a **4-digit room code**.
- The room is live. Check without joining: `GET http://localhost:3000/api/share/health` -> `{"rooms":N,"guests":M}`.
- The share service is where the host is (`ws://localhost:3000/ws/share` for the dev server; a deployed game uses its
  own origin). Override with `url` if the host is elsewhere.
- A wrong code is rate-limited (a few a minute per address), so read the code from the game rather than guessing.

## 3. Calls

```json
{"name":"join_game","arguments":{"code":"8789","name":"deepseek","autopilot":false,"url":"ws://localhost:3000/ws/share"}}
{"name":"guest_status","arguments":{"radius":24}}
{"name":"guest_act","arguments":{"action":"goto","position":[12,64,8],"bridge":true}}
{"name":"guest_act","arguments":{"action":"break_block","position":[12,64,7]}}
{"name":"guest_act","arguments":{"action":"place_block","position":[13,64,8],"block":"oak_planks"}}
{"name":"guest_act","arguments":{"action":"loot_chest","position":[10,64,6]}}
{"name":"guest_act","arguments":{"action":"chat","message":"hello from the agent"}}
{"name":"leave_game","arguments":{}}
```

Useful actions for this case: `goto` (with `bridge:true` to place blocks over gaps), `move`, `look`, `jump`,
`place_block`, `break_block`, `mine_block`, `collect_resources`, `loot_chest`, `attack` (only if the host allows PvP),
`chat`, `wait`, `stop`, `autopilot` (on/off).

`autopilot` **defaults to true** in `join_game`; its brain is tuned for the mini-games, so for co-op building pass
`"autopilot": false` and drive it with `guest_act`, or flip it later with
`{"action":"autopilot","enabled":false}`.

## 4. What happens, step by step

1. `join_game` connects to the share service and asks for the code's room.
2. The host's tab answers and sends the **world snapshot** (terrain, edits, time, host position).
3. The guest builds its own copy and spawns **1.2 blocks beside the host**, in the world's game mode
   (`worldSyncManager.js`: `data.hostPos.x + 1.2`).
4. From then on: `guest_status` reads its position, inventory, nearby players/chests/drops and chat; `guest_act` moves
   and acts; the host sees all of it as a player.
5. `leave_game` (or the host closing the world) disconnects it.

## 5. What the agent can and cannot do

| Can | Cannot |
|---|---|
| walk, jump, look; break and place blocks; mine; collect resources | change gamerules, weather, time, difficulty, gamemode |
| open chests, take and deposit items, wear armour | `/give`, `/fill`, any command - a guest has no chat commands |
| fight players and mobs subject to the host's PvP setting | act at all if the host's world closes or drops it |
| chat, wait, stop; survive with real gravity and health | use `run_plan` / build plans / screenshots of the host's view |

## 6. Gotchas

- **No autosave on the guest side**: what it builds is only as durable as the host's world.
- **The host's game mode matters**: in survival the guest can be hurt and can starve; in creative it can fly.
- **Names**: pass `name` (<= 24 chars) if you run more than one guest; the host's chat uses it.
- **Multiple guests**: `guest_status` / `guest_act` take an optional `name` to pick which bot to talk to.
- **Base game has no match state**: `guest_status` shows world state, not phases/rounds (that is SkyWars/Bed Wars).

## 7. Verify, disconnect

- Verify: `guest_status` -> position, health, inventory, `players` (the host's name and distance).
- Disconnect: `leave_game` `{}`. The host sees the player leave; nothing else changes.

## 8. Where the code is

`packages/blockyland-mcp/server.mjs` (`join_game` -> `GuestPeerSession`, `shareUrl` default at line ~42),
`packages/blockyland-mcp/guestPeer.js` (the guest client, `normalizeShareUrl`, inventory, chests, movement),
`src/multiplayer/signaling.js` + `server/shareRendezvous.js` (the introduction service), `src/multiplayer/shareProtocol.js`
(what the host accepts from a guest).
