# Filming AI Agents Playing Horizon (Minecraft Java 26.3 in Rust)
## Complete Step-by-Step Playbook (Designed for Fast/Small Models like Gemini 3.8 Flash)

This guide explains how to run 4 autonomous AI agents (`Aria`, `Basil`, `Corin`, `Delphi`) inside **Horizon** (the Rust rewrite of Minecraft Java Edition 26.3), record their match with **ReplayMod 2.6.28** (`.mcpr` + 3D camera keyframes) and live client telemetry, and render a 1080p esports-style broadcast movie (`outputs/agent-expedition-horizon-gemini/agent-expedition-horizon-gemini.mp4`).

Every command and script in this playbook has been tested end-to-end on Windows (`hz-dry10-gemini`). Follow the 8 steps in order without skipping any step.

---

## 0. The Three Golden Rules

1. **Film real play only.** Every agent must be a live LLM session driving its own Horizon client through `replication/horizon/hz-play.mjs` (or `horizon-ctl` play tools). Every chat caption, advancement banner, death, and trajectory in the movie must come **verbatim** from the run's recorded `digest.md` (`events.jsonl` and `frames.jsonl`). Never hard-code fake chat or fake movements.
2. **Never use cheat commands for agents.** Agents may only move, look, break blocks, place blocks, open/click inventory slots, attack, and chat. Server operator commands (`tp`, `gamemode`, `kick`) are reserved strictly for the `Camera` spectator client.
3. **Never run the full unit test suite (`npm test`).** Only run the scripts listed in this guide.

---

## 1. Reference Files & Scripts

| File / Script | Purpose |
| --- | --- |
| [`replication/horizon/run-hz-dry10-gemini.mjs`](run-hz-dry10-gemini.mjs) | Master harness: boots `horizon-server`, connects the ReplayMod `Camera` client, launches 4 `horizon-client` instances (`Aria`, `Basil`, `Corin`, `Delphi`), starts 30 fps `ffmpeg` captures, polls `states.jsonl` & `events.jsonl` at 2 Hz, and saves `recording.mcpr` at full time |
| [`replication/horizon/hz-play.mjs`](hz-play.mjs) | Survival-authentic CLI used by the 4 agents (`status`, `find-block`, `move-to`, `mine-nearest`, `place`, `equip`, `attack-nearest`, `chat`, and real UI slot-click `craft`, `smelt`, `collect-furnace` macros) |
| [`replication/horizon/mc-camera.mjs`](mc-camera.mjs) | Launches official Minecraft 26.3 + Fabric + ReplayMod 2.6.28 (`--xmx=900M`) directly into the Horizon server |
| [`replication/horizon/build-hz-replication-data.mjs`](build-hz-replication-data.mjs) | Converts Horizon `film/{states,events,*-transcript}.jsonl` into Blockyland's `recording/{frames,blocks}.jsonl`, `events.jsonl`, and `programs/<Name>.jsonl` |
| [`replication/film/build.mjs`](../film/build.mjs) | Builds `public/cinema-replication/<run>/recording.json` and `replication/runs/<run>/digest.md` |
| [`replication/horizon/refilm-hz-dry10-gemini.mjs`](refilm-hz-dry10-gemini.mjs) | Computes 3D camera keyframes (`camera:position`, `camera:rotation`, `timestamp`) for every scene in the edit and injects `timelines.json` into `recording.mcpr` |
| [`src/cinema/replicationEditHzDry10Gemini.js`](../../src/cinema/replicationEditHzDry10Gemini.js) | The 18-scene broadcast edit (Cold-Open Highlights, Line-up Card, LIVE/REPLAY scenes with verbatim chat captions, Full-Time Summary & Verdict Cards) |
| [`scripts/narrate-replication.mjs`](../../scripts/narrate-replication.mjs) | Generates dual-caster OpenAI `gpt-4o-mini-tts` commentary clips (`ash` play-by-play + `ballad` color analyst) and verifies zero audio overlaps |
| [`scripts/render-film.mjs`](../../scripts/render-film.mjs) | Renders the storyboard preview (`--preview`), runs the 3D continuity check (`check.json`), and exports the final 1080p MP4 (`--publish --fresh`) |

---

## 2. Step-by-Step Production Workflow

### Step 1: Prepare Agent Workspaces & Subagent Definition

Create isolated agent workspaces outside the repository so the 4 player agents only see their survival instructions:

```powershell
# Creates C:\Users\pope1\blockyland-agents\hz-dry10-gemini\{Aria,Basil,Corin,Delphi,shared}
node -e "
import fs from 'node:fs'; import path from 'node:path';
const base = 'C:/Users/pope1/blockyland-agents/hz-dry10-gemini';
for (const d of ['Aria','Basil','Corin','Delphi','shared']) fs.mkdirSync(path.join(base, d), { recursive: true });
"
```

Define the `horizon-player` subagent using `define_subagent` with `EnableWriteTools: true`:
- **Role**: Autonomous Minecraft 26.3 survival player on Horizon.
- **Allowed CLI**: `node c:\Users\pope1\.gemini\antigravity\scratch\Minecraft_in_browser\replication\horizon\hz-play.mjs <Name> <command> [args...]`
- **Core commands available in `hz-play.mjs`**:
  - `status` — returns position, health, food, inventory, nearby blocks, and recent chat.
  - `chat "<message>"` — broadcasts your action and coordinates to teammates (`<Aria> ...`).
  - `mine-nearest <block> [radius]` — walks to and breaks the nearest matching block (`oak_log`, `birch_log`, `stone`, `cobblestone`, `coal_ore`, `iron_ore`) and collects the drop.
  - `craft <recipe> [tableX tableY tableZ]` — performs real 2×2 or 3×3 inventory slot clicks (`planks`, `stick`, `crafting_table`, `torch`, `wooden_pickaxe`, `wooden_sword`, `stone_pickaxe`, `stone_sword`, `furnace`, `iron_pickaxe`, `iron_sword`).
  - `place <item> <x> <y> <z> [face]` — equips `<item>` and places it against block `<x> <y> <z>`.
  - `smelt <fx> <fy> <fz> <ore_item> <fuel_item>` & `collect-furnace <fx> <fy> <fz>` — loads and collects smelted ingots from a placed furnace.
  - `equip <item>` / `attack-nearest <mob>` / `move-to <x> <y> <z>`.

---

### Step 2: Launch the Horizon Server, ReplayMod Camera, and 4 Clients

Run the harness script in the background (`WaitMsBeforeAsync: 5000`):

```powershell
node replication/horizon/run-hz-dry10-gemini.mjs --seconds=600
```

#### Critical Hardware & Window Rules (Already Built Into `run-hz-dry10-gemini.mjs`)
- **Memory budget (5 clients on one machine)**:
  - `mc-camera.mjs` MUST run with `--xmx=900M` (default `-Xmx2G` starves the 4th Horizon client of RAM).
  - Each `horizon-client` MUST run with `--render-distance 3` and `--width 640 --height 340`.
  - `horizon-server` MUST set `"spawn-protection" = 0` (otherwise non-op agents cannot break or place blocks within 16 blocks of spawn), `low_memory = true`, and `admin_feedback_to_ops = false` (so `/tp Camera ...` does not spam chat).
- **Window placement for `ffmpeg gdigrab`**:
  - Never place a window at `(0, 0)`: Windows 10/11 invisible DWM shadow borders extend 8px left (`x = -8`), which causes `ffmpeg -f gdigrab` to exit with **code 5 (`Input/output error`)**. Always place windows at `x >= 20, y >= 20` (e.g., `(20, 20)`, `(960, 20)`, `(20, 510)`, `(960, 510)` with size `900x470`).

Wait until the task log prints `=== MATCH LIVE (600s) ===` (about 90 seconds after launch, once `Camera` and all 4 Horizon clients have joined).

---

### Step 3: Spawn the 4 Gemini 3.8 Flash Agents & Schedule Match End

1. Call `invoke_subagent` 4 times in parallel with `TypeName: 'horizon-player'` and `Model: 'flash'`:
   - **Aria (`Mining & Weapons Specialist`)**: Chop 3 logs → craft planks, sticks, crafting table, wooden pickaxe → dig quarry staircase for cobblestone, coal, and raw iron → upgrade to stone pickaxe (`[Getting an Upgrade]`) → smelt raw iron (`[Acquire Hardware]`) and craft/equip `iron_sword` → guard squad & mine deeper iron.
   - **Basil (`Quartermaster & Smelter`)**: Chop 4 logs → establish base camp crafting table near spawn → mine 12+ cobblestone and coal (`[Stone Age]`, `[Getting an Upgrade]`) → craft and place the camp `furnace` and `torch` network → smelt iron for the team.
   - **Corin (`Quarry Engineer`)**: Chop logs → craft wooden pickaxe & sword → excavate the main stepped quarry staircase (`[Stone Age]`, `[Getting an Upgrade]`) → craft 8 torches and stone tools → mine coal and deep iron veins.
   - **Delphi (`Perimeter Scout & Resource Gatherer`)**: Chop timber → craft wooden pickaxe & sword → scout perimeter and cave entrances → mine stone and coal (`[Stone Age]`) and report hazards in chat.
2. Call `schedule({ DurationSeconds: 600, Prompt: '10-minute Horizon match complete.' })` and **end your turn** (do not poll in a loop).
3. When the 600-second timer wakes you up:
   - Immediately call `manage_subagents({ Action: 'kill_all' })` to stop all 4 subagents.
   - Wait ~15 seconds for `run-hz-dry10-gemini.mjs` to stop the 4 `ffmpeg` processes, kick `Camera`, and copy `.minecraft/replay_recordings/<latest>.mcpr` to `replication/runs/hz-dry10-gemini/film/recording.mcpr`.

---

### Step 4: Convert Horizon Telemetry to `recording.json` & `digest.md`

Run the converter and film builder:

```powershell
node replication/horizon/build-hz-replication-data.mjs hz-dry10-gemini
node replication/film/build.mjs hz-dry10-gemini
```

#### What `build-hz-replication-data.mjs` Does (And Why It Matters)
1. **Numeric `BLOCKS` IDs**: Maps Horizon block names (`oak_log`, `crafting_table`, `furnace`, `torch`, `coal_ore`, `iron_ore`, `water`, `air`) to numeric `BLOCKS` IDs from `src/blocks.js` (`0`, `8`, `21`, `55`, `24`, `14`, `15`, `12`), because `src/cinema/replicationFilm.js` passes block IDs directly to `world.setVoxel(x, y, z, id)`.
2. **Terrain-Hugging & Subterranean Quarry Mapping**: Maps Horizon `y` coordinates (`horizonY`, where surface is `~67`) onto Blockyland's `World(20261103, 'all')` terrain surface (`floorY(x, z)`):
   - Surface positions (`horizonY >= 66`) map to `smoothFloorY(x, z)` so players stand cleanly on the ground.
   - Underground quarry/cave positions (`horizonY < 66`) map to `smoothFloorY(x, z) - (67 - horizonY)` and automatically carve `BLOCKS.AIR (0)` along the underground path so subterranean cutaway shots show the excavated tunnels clearly.
3. **Event Deduplication**: Formats chat as `{ t: tick, kind: 'chat', from: player, text: message }` and deduplicates advancements per `${player}:${title}` so each advancement appears once on the HUD.

Read the generated `replication/runs/hz-dry10-gemini/digest.md` from top to bottom before writing a single scene of the edit.

---

### Step 5: Write the Broadcast Edit (`src/cinema/replicationEdit*.js`)

Create or update `src/cinema/replicationEditHzDry10Gemini.js` (and `replication-film-hz-dry10-gemini.html`) using **only verbatim timestamps and chat quotes from `digest.md`**:

1. **Cold-Open Highlights (3 scenes, `tag: 'HIGHLIGHTS'`)**: Pick the 3 most exciting moments from `digest.md` (e.g., unlocking `Acquire Hardware` & crafting the Iron Sword, lighting the furnace hub, rapid rescue response).
2. **Pre-Game Line-up Card (`tag: 'PRE-GAME'`)**: Aerial orbit (`cam: { type: 'aerial', at: [21, 30, -48], dist: 44, height: 28, spin: .25, angle: 2.1 }`) with `card: { lineup: true, title: 'THE AGENT EXPEDITION: GEMINI ON HORIZON', sub: '...', roles: { Aria: [...], Basil: [...], Corin: [...], Delphi: [...] } }`.
   - *Tip*: Keep `card.title` under 42 characters so it fits inside the 1280×720 broadcast frame with clean margins.
3. **Chronological Match Scenes (10–14 scenes, `tag: 'LIVE'` & `'REPLAY'`)**:
   - Use `cam: { type: 'group' | 'follow' | 'face', who: 'Aria' | ['Aria', 'Basil'], cutaway: true/false, dist: 3.0..5.5, height: 1.5..2.3 }`.
   - Always set `cutaway: true` whenever the subject is underground (`horizonY < 66`) so `replicationFilm.js` slices away the rock between the camera lens and the miners.
   - Copy `captions: [{ atG: <sec>, dur: 4.5, who: '<Name>', kind: 'chat', text: '<exact chat text from digest.md>' }]` verbatim.
4. **Full-Time Summary & Architecture Cards (2 scenes, `tag: 'FULL TIME'`)**: Summarize each agent's real achievements and team advancement totals.

Register the run ID (`'hz-dry10-gemini'`) in:
- [`src/cinema/replicationFilm.js`](../../src/cinema/replicationFilm.js) (`EDITS`)
- [`scripts/narrate-replication.mjs`](../../scripts/narrate-replication.mjs) (`EDITS`)
- [`scripts/render-film.mjs`](../../scripts/render-film.mjs) (`FILMS` as `'agent-expedition-horizon-gemini'`)

---

### Step 6: Voice Commentary & Eliminate All Overlaps

1. Generate the dual-caster OpenAI TTS clips (`pbp` = `ash`, `color` = `ballad`):
   ```powershell
   node scripts/narrate-replication.mjs --run=hz-dry10-gemini
   ```
2. The first run prints the exact duration of every clip (`h1 pbp: 9.17 s`, `n01 pbp: 12.37 s`, etc.) and reports any `OVERLAP:` lines.
3. Update `at` and `dur` in `src/cinema/replicationEditHzDry10Gemini.js` using this exact formula for every scene:
   - First narrator line in scene: `at: 0.4` (or `0.2` for highlights, `0.6` for cards).
   - Second narrator line in scene: `at: +(firstLineAt + firstClipDuration + 0.5).toFixed(1)`.
   - Scene duration `dur`: `+(lastLineAt + lastClipDuration + 0.6).toFixed(1)`.
4. Re-run `node scripts/narrate-replication.mjs --run=hz-dry10-gemini` (instant, since clips are cached by content hash) and verify it prints:
   ```text
   No overlaps.
   ```

---

### Step 7: Inject 3D Camera Keyframes into ReplayMod (`recording.mcpr`)

Run [`replication/horizon/refilm-hz-dry10-gemini.mjs`](refilm-hz-dry10-gemini.mjs) to compute the 3D camera path (`camera:position`, `camera:rotation`, `timestamp`) for all 18 scenes and write `timelines.json` directly into `replication/runs/hz-dry10-gemini/film/recording.mcpr`:

```powershell
node replication/horizon/refilm-hz-dry10-gemini.mjs
```

---

### Step 8: Preview Check & Full 1080p Movie Render

1. Run the fast preview and continuity check (~90 seconds):
   ```powershell
   node scripts/render-film.mjs --movie=agent-expedition-horizon-gemini --preview
   ```
   - Inspect `outputs/agent-expedition-horizon-gemini/storyboard.jpg` and `outputs/agent-expedition-horizon-gemini/poster.png` to verify framing, card margins, and HUD milestones.
   - Check that `Continuity check: clean` is printed.
2. Render and publish the full 1080p 30 fps MP4 (~20–30 minutes):
   ```powershell
   node scripts/render-film.mjs --movie=agent-expedition-horizon-gemini --publish --fresh
   ```
   - Outputs:
     - `outputs/agent-expedition-horizon-gemini/agent-expedition-horizon-gemini.mp4`
     - `public/movies/agent-expedition-horizon-gemini.mp4`
     - `outputs/agent-expedition-horizon-gemini/poster.png`
     - `outputs/agent-expedition-horizon-gemini/storyboard.jpg`
