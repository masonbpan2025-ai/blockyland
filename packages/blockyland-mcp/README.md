# blockyland-mcp

Let your own AI app play in [Blockyland](https://blockyland.online), the voxel sandbox game that runs in your browser.
Claude Code, Gemini CLI, Codex, Cursor or any other app that supports MCP can look around your world, build, run
commands, and talk with you in the game's Agent Terminal. It uses your AI app's own account, so no API key goes into
the game.

Blockyland is an independent fan project, not affiliated with Mojang Studios or Microsoft.

## Setup

You need [Node.js](https://nodejs.org) 18 or newer. Add the server to your AI app once, then restart the app:

| AI app | Command |
| --- | --- |
| Claude Code | `claude mcp add blockyland -- npx -y blockyland-mcp@latest` |
| Claude Code on native Windows | `claude mcp add blockyland -- cmd /c npx -y blockyland-mcp@latest` |
| Gemini CLI | `gemini mcp add blockyland npx -y blockyland-mcp@latest` |
| Codex | `codex mcp add blockyland -- npx -y blockyland-mcp@latest` |
| Any MCP client | Command `npx`, arguments `-y blockyland-mcp@latest`, transport stdio |

`@latest` makes npx fetch the newest version each time the app starts, so the server keeps up with the game.

Gemini CLI: if it says your Google login is "no longer supported for Gemini Code Assist for individuals", sign it in with a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey) instead (set `GEMINI_API_KEY`). Google stopped serving Gemini CLI on the free personal login in 2026.

For a JSON config (Claude Desktop, Cursor and others):

```json
{
  "mcpServers": {
    "blockyland": { "command": "npx", "args": ["-y", "blockyland-mcp@latest"] }
  }
}
```

## Play

1. Open Blockyland and start a world in **Creative**, or with cheats on.
2. Press **C** to open the Agent Terminal, switch **Offline Mode** off, and open **🔌 Connect AI**. Once your AI app is
   running it says "Found Claude Code" (or your app) and shows a 6-digit code.
3. Tell your AI app: **"Connect to Blockyland with code 123456"**.
4. Type requests in the Agent Terminal ("build a lighthouse on that cliff"). Your AI app reads them, builds, and
   answers there. You can also ask it directly in the app.

## What the AI app can do

| Tool | What it does |
| --- | --- |
| `connect` | Pair with your game by its code |
| `wait_for_player_message` | Wait for what you type in the Agent Terminal (with a screenshot of your view, if you allow it) |
| `get_state`, `look_around`, `screenshot` | See your position, the terrain, the room you are in, nearby structures and creatures, and your view |
| `plan_reference`, `run_plan` | Build, edit or destroy structures, summon, give, set weather or time, hang paintings, and more |
| `run_command` | Run a chat command with your permissions |
| `say` | Answer you in the Agent Terminal |

## Safety

- The server listens only on your own computer (`127.0.0.1`, port 47615), and accepts the game only from
  `blockyland.online` or a game served from `localhost`, so no other website can pose as it.
- A game tab is used only after your AI app gives its code. Nothing reaches the AI app unless you switch Offline Mode
  off.
- The AI app can change the world only where you could use the Agent Terminal yourself (Creative, or cheats on).
  Removing things needs an explicit confirmation from the app.
- Screenshots go to the AI app only while "Let the AI see screenshots of my view" is checked.

## Options

| Environment variable | Default | Use |
| --- | --- | --- |
| `BLOCKYLAND_MCP_PORT` | `47615` | Another port; open the game with `?agent-control-port=<port>` to match |
| `BLOCKYLAND_MCP_ORIGINS` | none | More page origins to accept, comma-separated (a self-hosted copy of the game) |

`blockyland-mcp --help` prints the setup, `blockyland-mcp --version` the version.

The full guide is
[docs/agent-control.md](https://github.com/masonbpan2025-ai/blockyland/blob/master/docs/agent-control.md). License:
MIT.
