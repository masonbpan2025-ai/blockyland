# Agent Control: play with your own AI app

Agent Control lets Claude Code, Gemini CLI, Codex, Cursor or any other app that supports MCP see and change the
Blockyland world you are playing, and talk with you in the game's Agent Terminal. The AI runs in your own app, with
your own account. No API key goes into Blockyland.

It replaces the Agent Terminal's old AI Settings (vendor, model and API key). The terminal now has two modes:

| Mode | Who answers |
| --- | --- |
| Offline Mode **ON** (the default) | The built-in presets: "build a castle", "make it rain", "summon 3 cows", the player bot |
| Offline Mode **OFF** | Your AI app, connected in 🔌 Connect AI |

## Connect

1. **Add Blockyland to your AI app, once.** You need [Node.js](https://nodejs.org) 18 or newer and nothing else:
   the server is the npm package [`blockyland-mcp`](../packages/blockyland-mcp/README.md), which npx downloads and
   starts for you. In a terminal:

    | AI app | Command |
    | --- | --- |
    | Claude Code | `claude mcp add blockyland -- npx -y blockyland-mcp@latest` |
    | Claude Code on native Windows | `claude mcp add blockyland -- cmd /c npx -y blockyland-mcp@latest` |
    | Gemini CLI | `gemini mcp add blockyland npx -y blockyland-mcp@latest` |
    | Codex | `codex mcp add blockyland -- npx -y blockyland-mcp@latest` |
    | A JSON config (Claude Desktop, Cursor...) | `"blockyland": { "command": "npx", "args": ["-y", "blockyland-mcp@latest"] }` under `mcpServers` |

    Then restart the AI app. `@latest` makes npx fetch the newest server each time the app starts, so it keeps up
    with the game. If the game and the server ever disagree, Connect AI says which one to update.

    Gemini CLI: if it says your Google login is "no longer supported for Gemini Code Assist for individuals", sign it in with a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey) instead (set `GEMINI_API_KEY`). Google stopped serving Gemini CLI on the free personal login in 2026.

    **From a checkout** of this repository (to try changes to the server before they are published), point the app
    at the script instead: `claude mcp add blockyland -- node /path/to/blockyland/scripts/blockyland-mcp.mjs`, after
    `npm install`. On the local dev server, 🔌 Connect AI shows that command with this checkout's path filled in.

2. **In the game**, open a world in Creative or with cheats on, press **C**, switch **Offline Mode** off, and open
   **🔌 Connect AI**. It says "Found Claude Code" (or your app) once the app is running, and shows a 6-digit code.
3. **Tell your AI app** "Connect to Blockyland with code 123456 and keep listening for my terminal requests". The terminal then says it is connected.
4. **Type requests in the Agent Terminal.** Your AI app reads them, builds, and answers in the terminal. You can
   also ask it directly in the AI app.

**Following a request.** A status line above the input, and the pill in the header, show where your request is:

| Status line | Pill | Meaning |
| --- | --- | --- |
| ⏳ Sent to your AI app, waiting for it to pick it up… | `SENT 3 s` | After 30 s it suggests asking the app to "wait for my requests in Blockyland" |
| ⚙️ Claude Code — Working: building Garden fence… | `WORKING 42 s` | What it is doing now, from each tool it calls: looking around, building, running a command, answering |
| ✓ Done in 1 min 12 s. | `DONE ✓` | It went back to waiting for your next request, or it answered and then stayed quiet for 8 s. The log adds "✓ Done: … finished …", with a chime, and chat says so too if the terminal is closed |
| ✗ Your AI app disconnected before it finished. | `STOPPED` | Anything already built stays |

**Watching it build.** Once your AI app is connected, the setup steps fold away to one status line; **▾ Show steps**
brings them back. **▁ Small** shrinks the terminal to a small panel in the bottom-left corner and clears the dimmed
backdrop, so you can watch the world change while it works. **⤢ Large** restores it. The game remembers your choice.

The code changes each time Agent Control starts. After a page reload the tab reconnects by itself. **New code**
drops the connection.

**Disconnect** beside **Connect AI** closes the AI connection and stops retries while keeping Offline Mode off.
Click **Connect AI** to reconnect and pair again with the displayed code.

Pairing immediately starts a 25-second listen for the first request, so the AI does not need another tool call to
pick it up. The response includes the request and attached images, or an explicit instruction to keep listening.
After each request the AI must call `wait_for_player_message` again, including after a timeout. A server cannot
force an idle AI app to start a new model turn; clients that stop their listening loop still need to be asked to resume.
This behavior is the same for Claude, Codex, Gemini, DeepSeek and other MCP clients.

The progress bar sweeps when the amount of work is unknown and shows measured percentages during a build or an
agent's `report_progress` update. Percentages describe the current step, not an estimate of the whole request.
Tool activity and brief public work summaries appear in the terminal. For AI apps, the server sends standard
[MCP progress notifications](https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/progress)
when a call supplies `_meta.progressToken`, plus
[MCP logging notifications](https://modelcontextprotocol.io/specification/2025-06-18/server/utilities/logging).
The client controls whether these appear in its chat or logs. Agents are instructed to also post short work updates
in their own chat. These are activity summaries, not private model reasoning.

## Tools

The list comes from `packages/blockyland-mcp/protocol.js` (`TOOLS`), the one table the server, the argument checks and this
page share. `tests/agentControlDocs.test.js` fails when a tool is missing here.

| Tool | Runs in | What it does |
| --- | --- | --- |
| `connect` | server | Pair immediately, then listen for the first request for up to 25 s (1–50 s with `timeout_seconds`); `listen:false` skips listening; without a code, return connection status |
| `wait_for_player_message` | server | Wait (default 50 s, up to 600 s) for what the player types in the Agent Terminal, with a screenshot of their view if allowed and any image they attached |
| `report_progress` | server | Show a brief work summary and optional real percentage (0–100) for the current step in the terminal and AI client |
| `get_state` | game | Position, facing, dimension, game mode, health, food, time, weather, held item, hotbar, crosshair block |
| `look_around` | game | The world as text: a 33x33 terrain map, waterline, crosshair, the view ahead, the room, nearby structures and creatures, and the buildings made this session with their ids |
| `screenshot` | game | A JPEG of the player's view; refused if the player turned screenshots off |
| `plan_reference` | game | The plan language: actions, operation types, limits, how to target "this room" or "that wall", block and mob names |
| `run_plan` | game | Carry out a plan: build, edit, destroy, summon, give, weather, time, hang paintings, the player bot, and more |
| `run_command` | game | Run a chat command as the player would type it, with the player's permissions |
| `say` | game | Show an answer in the Agent Terminal (and in chat when the terminal is closed) |
| `join_game` | server | Join a hosted Blockyland game (Base Game shared world, SkyWars, or Bed Wars) as a playable guest character using its 4-digit room code |
| `leave_game` | server | Disconnect the MCP guest player from the shared world or mini-game match |
| `guest_status` | server | Observe the joined guest player's state, inventory, nearby players, chests, drops, chat, and SkyWars or Bed Wars match state |
| `guest_act` | server | Perform high-level goals (`goto`, `bridge_to`, `loot_chest`, `attack`, `break_bed`, `collect_resources`, `mine_block`) or direct actions (`move`, `look`, `jump`, `place_block`, `break_block`, `buy`, `choose_team`, `equip`, `select`, `start_match`, `respawn`, `chat`, `wait`, `stop`) as the joined guest player |

### Joining a game as a player (Base Game, SkyWars, Bed Wars)

Any game that allows other players to join by a 4-digit room code can also be joined by your AI app through MCP. For a complete technical walkthrough and guide covering all parameters, autonomous autopilot behavior, and localhost vs. production differences, see [`docs/agent-multiplayer-guide.md`](./agent-multiplayer-guide.md).

Direct `move` actions and Mineflayer `setControlState` walking/sprinting have no automatic void protection,
including in SkyWars and Bed Wars. Grounded, explicit Sneak retains Minecraft's edge restraint; releasing Sneak
allows a fall. There is no automatic centering on bridge blocks. High-level pathfinding and autopilot may choose
safe routes (`moveStepToward` explicitly opts into `avoidVoid: true`), and `bridge_to` places real blocks before
crossing. Those are navigation decisions: gravity and incoming knockback continue during scripts and navigation,
and every peer receives the resulting position and void death.

Multiplayer players and MCP guests share 20 Hz knockback rules (`packages/blockyland-mcp/knockback.js`):
0.4 blocks/tick base strength, 0.91 horizontal air drag, ordinary-block grounded drag of 0.6 × 0.91,
0.08 blocks/tick gravity, and 0.98 vertical drag. Projectile pushes follow the projectile's travel direction.
Snowballs push without taking health. Repeated hits within the 10-tick hurt window cannot stack fresh impulses.
The three-client `e2e/multiplayerKnockback.pw.js` checks bridge falls, visible replication, and weapon kill credit
in both mini-games; `tests/multiplayerKnockback.test.js` also exercises a headless victim busy running a script.
References: [Minecraft controls](https://www.minecraft.net/en-us/article/minecraft-controls),
[Minestom knockback implementation](https://github.com/Minestom/Minestom/blob/master/src/main/java/net/minestom/server/entity/LivingEntity.java),
and [Minecraft's snowball knockback change](https://www.minecraft.net/en-us/article/minecraft-26-4-snapshot-3).

- **Base Game (Share World)**: Open a world, click **Share World** (or press **M**), and give the 4-digit room code to your AI app (`join_game` with `code`). If your tab is already paired via `connect`, calling `join_game` without a code opens and joins your world automatically.
- **SkyWars**: Start SkyWars from the title screen and give the 4-digit lobby code to your AI app. Once joined via `join_game`, the match unlocks (2+ players); the agent spawns in its island cage, loots chests (`loot_chest`), bridges across islands (`bridge_to`), and fights (`attack`).
- **Bed Wars**: Start Bed Wars from the title screen and give the 4-digit lobby code to your AI app. The agent can pick a team (`choose_team`), collect iron/gold/diamonds/emeralds from generators (`collect_resources`), buy gear, blocks, and team upgrades (`buy`), bridge to enemy islands (`bridge_to`), and destroy enemy beds (`break_bed`).
- **Multi-Agent Coexistence**: Multiple agents can join the same Bed Wars or SkyWars game simultaneously on different teams or cages. When joining, never disconnect or terminate existing agents already connected to the match. When leaving, pass `leave_game` with `{ "name": "<agent_name>" }` so other active bots remain connected.

Errors are one JSON object, `{"error": "<what to do next>", "kind": "<kind>"}`, with kind one of `usage`, `unknown`,
`state`, `busy`, `timeout`, `connection`, `denied`, `confirm` or `failed`.

## Rules

- **Local only.** The server listens on `127.0.0.1` (port 47615; `BLOCKYLAND_MCP_PORT` changes it, and the page then
  needs `?agent-control-port=N`). It accepts only pages from `localhost`, `127.0.0.1` and `https://blockyland.online`
  (`BLOCKYLAND_MCP_ORIGINS` adds others), so another website open in the browser cannot pose as the game.
- **Opt in.** The page reaches for the server only while Offline Mode is off. A player who never switches it off
  never has the page contact `127.0.0.1`.
- **Pairing.** A game tab is used only after the AI app gives its code, or after a reload of an already paired tab
  (a session token kept in that tab's sessionStorage).
- **The same permissions as the terminal.** `run_plan` changes the world only in Creative or with cheats on, the rule
  that already gates the Agent Terminal. `run_command` applies each command's own permission, as when the player
  types it.
- **Confirm what removes things.** `run_plan` with `destroy` or `clear`, and `/fill`, `/setblock`, `/clone`, `/kill`
  and `/clear`, need `confirm: true`, which an AI app should pass only when the player asked for it.
- **Screenshots** go to the AI app only while "Let the AI see screenshots of my view" is checked.
- **Messages are the player's.** Only what the player types in the Agent Terminal reaches `wait_for_player_message`.
- **A hidden tab keeps working.** Builds skip their small per-batch animation pause while the tab is hidden, because
  a hidden tab's timers slow to once a second.

## For developers

| Piece | File |
| --- | --- |
| Tool table, origins, argument checks, `PROTOCOL_VERSION` | `packages/blockyland-mcp/protocol.js` (the game imports it through `src/agentControl/protocol.js`) |
| MCP server (stdio) and the game socket | `packages/blockyland-mcp/server.mjs`; the `blockyland-mcp` command is `bin/blockyland-mcp.mjs`; from a checkout, `scripts/blockyland-mcp.mjs` (`npm run mcp`) |
| The page's connection, pairing and version check | `src/agentControl/bridge.js` |
| What each game tool does | `src/agentControl/gameTools.js` |
| The terminal's two modes and Connect AI | `src/ui.js` (`initGemini`), `src/agentTerminalControls.js`, `index.html` |
| Setup path on the dev server | `server/agentControlVite.js` |

Tests:

- `node scripts/test.mjs agent`: the unit tests, including `agentControlServer`, `agentControlBridge`,
  `agentControlTools`, `agentControlDocs` and `mcpPackage`. The last checks that the package ships every file it
  imports, needs nothing but `ws`, and that its command answers `--help`, `--version` and an MCP handshake.
- `npm run test:agent-control:browser`: a real browser, the real server and a scripted MCP client.
- `npm run test:agent-control:claude` (`scripts/agent-control-live.mjs`): one request played by a real Claude Code.
  It uses real usage (about $0.50 to $0.85 a run), so it is run by hand, never by a suite. It writes screenshots,
  Claude's transcript and a result to `outputs/agent-control-live/`. Add `--package <spec>` to start the server
  through npx as players do: `--package blockyland-mcp@latest` for the published one, or a tarball from `npm pack`
  to try a release before publishing it.

## Publishing the npm package

The package is `packages/blockyland-mcp/`. Publishing needs an npm account that owns the name `blockyland-mcp`
(free as of 2026-11-02).

1. Raise `version` in `packages/blockyland-mcp/package.json`: the patch number for a fix, the minor number for a new
   tool. Raise `PROTOCOL_VERSION` in `protocol.js` too if the game and an older server could no longer understand
   each other. The game then tells players with an old server to restart their AI app.
2. Check it: `node scripts/test.mjs agent`, then try the packed release with a real AI app:

    ```sh
    cd packages/blockyland-mcp && npm pack --pack-destination ../../outputs && cd ../..
    node scripts/agent-control-live.mjs --package outputs/blockyland-mcp-<version>.tgz
    ```

3. Publish, from the package folder:

    ```sh
    npm login                       # once
    cd packages/blockyland-mcp
    npm publish --access public
    ```

4. Deploy the game if its side changed too. Players pick up the new server the next time their AI app starts,
   because the setup command asks for `@latest`.
