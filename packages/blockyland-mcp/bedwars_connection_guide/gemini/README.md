# Bed Wars Connection Guide (Gemini / Antigravity)

Case 4 of 4. See `../../CONNECTION_GUIDE.md` for which case you want. This one is: **join a Bed Wars match as a player**
- pick a team, collect forge resources, buy equipment and upgrades, defend your bed, bridge across islands, and destroy enemy beds.

---

## 1. What This Connects

```
Gemini AI --stdio MCP--> blockyland-mcp (server.mjs) --ws://localhost:3000/ws/share--> Host's Browser Tab
                                                        (Match Rules: src/mods/bedwars/rules.js)
```

- **Team participant**: Spawns on the assigned team's island alongside team beds and resource forges.
- **Match rules authority**: The hosting browser validates economy transactions, block placements, combat, bed destruction, and team eliminations.
- **Autopilot or manual queue**: Autopilot defends the bed, collects forge materials, buys upgrades, and attacks; manual actions can be queued at any time.

---

## 2. Requirements

1. **Host in Bed Wars lobby**: Started Bed Wars from the title screen; note the **4-digit lobby code** (e.g. `1234`).
2. **Team availability**: Team slots vary by mode (Solo/Doubles: 8 teams; 3v3v3v3 / 4v4v4v4: 4 teams; Duel: 2 teams).
   - Valid team colors: `red`, `blue`, `green`, `yellow`, `aqua`, `white`, `pink`, `gray`.
3. **Minimum 2 players**: 2 or more contenders required before the host can start the match (`MIN_PLAYERS = 2`).

---

## 3. Quick Start: One-Command Join

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File packages\blockyland-mcp\bedwars_connection_guide\gemini\join-bedwars.ps1 -Code 1234 -Team blue -Strategy defender
```

Check team and bed status anytime:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File packages\blockyland-mcp\bedwars_connection_guide\gemini\join-bedwars.ps1 -Status
```

---

## 4. MCP Tools & Calls

```json
{"name":"join_game","arguments":{"code":"1234","name":"Gemini","team":"blue","autopilot":true,"difficulty":"normal","strategy":"defender"}}
{"name":"guest_status","arguments":{"radius":32}}
{"name":"guest_act","arguments":{"action":"collect_resources","target":"forge","count":16}}
{"name":"guest_act","arguments":{"action":"buy","item":"wool","count":16}}
{"name":"guest_act","arguments":{"action":"buy","item":"stone_sword"}}
{"name":"guest_act","arguments":{"action":"bridge_to","team":"red","block":"wool"}}
{"name":"guest_act","arguments":{"action":"break_bed","team":"red"}}
{"name":"guest_act","arguments":{"action":"respawn"}}
{"name":"leave_game","arguments":{"name":"Gemini"}}
```

### Action Reference for `guest_act`

| Goal | Action | Parameters | Description |
|---|---|---|---|
| Farm | `collect_resources` | `target: "forge" \| "diamond" \| "emerald"`, `count: 16` | Walk to generator and gather currency |
| Gear | `buy` | `item: "wool" \| "stone_sword" \| "iron_pickaxe"`, `count: 16` | Purchase from the island team shop |
| Travel | `bridge_to` | `team: "red"` or `position: [x,y,z]`, `block: "wool"` | Build bridges across the void toward targets |
| Attack | `attack` | `target: "player_id"`, `count: 50` | Engage enemy in melee combat |
| Win | `break_bed` | `team: "red"` | Destroy enemy bed (permanently eliminates enemy respawns) |
| Recover| `respawn` | *(no args)* | Respawn at home base while team bed remains intact (5s cooldown) |

---

## 5. Match Economy & Rules

- **Currency is physical items**: Generators drop `iron_ingot`, `gold_ingot`, `diamond`, and `emerald`. Purchases automatically deduct items from player inventory.
- **Forge sharing**: Teammates standing within 3 blocks of a forge generator automatically share iron and gold drops.
- **Equipment retention**:
  - **Tools (pickaxes, axes) and Armor**: Retained upon death and respawn.
  - **Swords**: Dropped upon death; players respawn with a basic wooden sword.
- **Team upgrades**: Purchased with diamonds at team chests; upgrades benefit all team members.
- **Bed destruction**: As long as your bed stands, you respawn after 5 seconds (`RESPAWN_SECONDS = 5`). If your bed is destroyed, death results in permanent elimination.

---

## 6. Multi-Agent Coexistence Guidelines

When multiple AI agents connect to Bed Wars (e.g. Gemini on Blue and DeepSeek on Green):
- **Never disconnect other connected agents**: Joining a match must never disconnect or reset other agents already in the game.
- **Always specify your agent's name when leaving**: Use `leave_game` with `{"name": "<agent_name>"}`. An empty `leave_game` call disconnects all active guest agents.
- **Never terminate background processes indiscriminately**: Do not kill all node processes or run blanket cleanup scripts. Multiple agents or supervisor processes (`mcp-supervise.mjs`) may be active on the system.
- **Pick distinct teams and names**: Always supply a unique `name` and specific `team` (e.g. `team: "blue"`) so both agents are correctly placed on their respective islands.

