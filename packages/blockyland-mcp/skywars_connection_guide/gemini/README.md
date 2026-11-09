# SkyWars Connection Guide (Gemini / Antigravity)

Case 3 of 4. See `../../CONNECTION_GUIDE.md` for which case you want. This one is: **join a SkyWars lobby as a competitor**
- the agent receives an island cage, loots starter chests, bridges to middle, gathers power items, and battles other players.

---

## 1. What This Connects

```
Gemini AI --stdio MCP--> blockyland-mcp (server.mjs) --ws://localhost:3000/ws/share--> Host's Browser Tab
                                                        (Match Rules: src/mods/skywars/rules.js)
```

- **Competitive participant**: Spawns inside an individual glass island cage in `adventure` mode until countdown ends.
- **Match rules authority**: The hosting browser validates combat, chest contents, void falls, and win states.
- **Autopilot or manual control**: Autopilot handles looting, bridging, and combat autonomously; actions can also be manually directed via command queue.

---

## 2. Requirements

1. **Host in SkyWars lobby**: Host started SkyWars from title screen; note the **4-digit lobby code** (e.g. `5659`).
2. **Open slot**: Lobby must have an open island slot (`slot != null`). Late joins enter as spectators until the next round.
3. **Minimum 2 players**: Match requires at least 2 contenders before the host can click Start.

---

## 3. Quick Start: One-Command Join

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File packages\blockyland-mcp\skywars_connection_guide\gemini\join-skywars.ps1 -Code 5659 -Strategy rusher -Difficulty normal
```

Check current match status:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File packages\blockyland-mcp\skywars_connection_guide\gemini\join-skywars.ps1 -Status
```

---

## 4. MCP Tools & Calls

```json
{"name":"join_game","arguments":{"code":"5659","name":"Gemini","autopilot":true,"difficulty":"normal","strategy":"rusher"}}
{"name":"guest_status","arguments":{"radius":24}}
{"name":"guest_act","arguments":{"action":"loot_chest","position":[3,31,25]}}
{"name":"guest_act","arguments":{"action":"bridge_to","position":[0,31,1],"block":"oak_planks"}}
{"name":"guest_act","arguments":{"action":"attack","target":"Player-1234","count":50}}
{"name":"guest_act","arguments":{"action":"autopilot","enabled":false}}
{"name":"leave_game","arguments":{"name":"Gemini"}}
```

### Parameter Reference

| Parameter | Options | Description |
|---|---|---|
| `difficulty` | `easy`, `normal`, `hard` | Sets the **agent's** combat reaction speed, CPS, and bridging precision |
| `strategy` | `auto`, `aggressive`, `rusher`, `defender`, `coop`, `pvp` | Dictates target prioritization and bridging path |
| `autopilot` | `true`, `false` | When true, the built-in bot brain plays the match automatically |

---

## 5. Match Lifecycle

1. **Lobby (`phase: "lobby"`)**: Players spawn in glass cages on separate floating islands.
2. **Countdown (`phase: "countdown"`)**: Host starts the match; 3-second timer sounds (`COUNTDOWN_SECONDS = 3`).
3. **Playing (`phase: "playing"`)**:
   - Cages open; game mode switches to `survival`.
   - Island chests contain starter weapons, blocks, and armor.
   - **Chest Refills**: First refill at 180s; second refill at 360s (adds Ender Pearls).
   - **Time Limit**: 600 seconds (`TIME_LIMIT_SECONDS = 600`).
4. **Ended (`phase: "ended"`)**: Match concludes when only one player/team remains alive or time expires.

---

## 6. Critical Match Rules & Gotchas

- **Last player alive wins**: Victory is determined by survival, not kill count. Knocking an opponent into the void grants a win even with 0 direct kills.
- **10-Second kill credit window**: A kill is attributed to an attacker only if damage was dealt within 10 seconds prior to death (`KILL_CREDIT_SECONDS = 10`).
- **Mid-game join**: Joining after the countdown starts assigns `slot: null` (spectator mode). Spectators cannot interact with chests or players until the host resets the round.
- **Leaving forfeits**: Calling `leave_game` during an active round marks the player as eliminated (`eliminated: 'left'`).

---

## 7. Multi-Agent Coexistence Guidelines

When multiple AI agents connect to SkyWars:
- **Never disconnect other connected agents**: Joining an active room must never disconnect or reset other agents already in the game.
- **Always specify your agent's name when leaving**: Use `leave_game` with `{"name": "<agent_name>"}`. An empty `leave_game` call disconnects all active guest agents.
- **Never terminate background processes indiscriminately**: Do not kill all node processes or run blanket cleanup scripts. Multiple agents or supervisor processes (`mcp-supervise.mjs`) may be active on the system.
- **Use unique agent names**: Assign distinct names (e.g. `Antigravity`, `deepseek`) so each agent gets its own cage slot without conflict.

