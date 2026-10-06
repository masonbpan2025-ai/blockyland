# Minecraft in the browser

Run `npm install` and `npm run dev`, then open http://localhost:3000.

## AI world editing

Press **C** to open the AI World Agent terminal. Open **⚙️ Settings**, pick a vendor, pick a model, and save that vendor's API key. Keys and choices are stored in this browser's localStorage and requests go directly from the browser to the vendor — no proxy. The status pill shows **DEEPSEEK READY**, **CHATGPT READY**, **GEMINI READY**, **OFFLINE**, or **ERROR**.

| Vendor | Default model | Default effort | Key |
| --- | --- | --- | --- |
| **DeepSeek** (default) | `deepseek-flash` (DeepSeek-V4.1-Flash) | `high` | [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| ChatGPT | `gpt-6-astra` | `medium` | [platform.openai.com](https://platform.openai.com/api-keys) |
| Gemini | `gemini-3.8-flash` | not applicable | [aistudio.google.com](https://aistudio.google.com/apikey) |

Each vendor keeps its own key, model, and reasoning effort. Switching vendors never clears another vendor's settings. Reasoning effort (`minimal`…`max`) is sent to DeepSeek and ChatGPT and hidden for Gemini. A pre-existing `gemini_api_key` from the older Gemini-only build is adopted automatically. Set `VITE_DEEPSEEK_MODEL`, `VITE_OPENAI_MODEL`, or `VITE_GEMINI_MODEL` in `.env.local` to override a default model, then restart Vite.

Every prompt is sent with the recent conversation turns, stable building IDs, names, positions, attachments, **the local terrain around the player, and a live screenshot of the player's current first-person view**. That means spatial requests work:

- “Build a lighthouse overlooking the water.”
- “Replace its stone walls with brick, keeping the windows.”
- “Bridge that gap in front of me.”
- “Add a viewing platform to the lighthouse.”
- “Destroy the lighthouse.”

Wires used: DeepSeek and ChatGPT use OpenAI-compatible `POST /chat/completions` with `response_format: {"type":"json_object"}` (DeepSeek also sends `thinking: {"type":"enabled"}` with `reasoning_effort`); Gemini uses `generateContent` with `responseMimeType: application/json`. The player's view is captured from the WebGL canvas, downscaled to 1024 px and JPEG-encoded before being attached; uncheck the settings checkbox to send world state only.

**Progress and long requests.** Every request is streamed, so the terminal shows the model's reasoning as it arrives — one live `🧠 thinking (12.3s)` line that reports the elapsed time, the reasoning-token count and the final trace. A status line updates every 0.5 s with either "waiting for DeepSeek to start responding" or how long it has been receiving output, and the progress bar creeps forward while the model thinks, so a slow request is never indistinguishable from a hang.

Output budgets allow for reasoning: DeepSeek gets 64K tokens in thinking mode (its documented default) and 8K with thinking off, ChatGPT 32K. Reasoning tokens are billed against that budget, so if a model still exhausts it while thinking and returns no JSON, the agent **retries once with thinking mode off** instead of failing. A request is aborted only after 60 s of complete silence (not a total-duration limit), and HTTP failures say what to do — rejected key, no credit, rate limit, or unavailable model. Uncheck "show live thinking" in ⚙️ Settings to hide the reasoning display.

### Offline mode

**Offline Mode** in ⚙️ Settings (or the `/offline` chat command) switches the agent to the built-in preset planner without deleting anything. Your API key, vendor, model and effort stay saved, no requests are sent, and the status pill reads **OFFLINE MODE**. Press the highlighted **✓ Offline Mode** button or run `/offline` again to hand control back to the API. The choice persists across reloads, and because it is separate from the key, "no key yet" (**NO KEY**) and "deliberately offline" never look the same. Offline mode is not a language model: it handles the preset builds and basic world commands listed below.

The planner supports custom voxel builds, edits in place, removal, stairs, water, mobs, weather, time, inventory, and compound requests. It can answer or ask for clarification when a request cannot be represented by the available game actions. It does not execute model-generated JavaScript.

Buildings track the blocks they change, including foundations and attachments. Removal restores the original blocks while preserving later player changes whose block values differ. Memory lasts for the current world session; reloading resets both the world and agent memory. Large building snapshots are explicitly marked when truncated.

**Naming.** The player-facing build system is the **Building Studio** and its **Building Library**: the 3D editor, the parametric build templates (`src/buildings/`), and the AI's build records (`builtBuildings`). The word *structure* is reserved for wiki **generated structures** (villages, mineshafts, ancient cities), which are not implemented — see `docs/structure-parity-gap-review.md`.

Without a key, the status shows **NO KEY**. This mode provides limited preset commands, including “build a lighthouse” followed by “destroy the lighthouse” or “destroy it”. It is not a language model. Free-form requests need a key for the selected vendor. API errors remain visible and never silently execute an offline substitute.

## Lighting and visual effects

Torches and redstone/soul torches use centered 3D models. All emitting blocks in this game's catalog register colored lights: lava, glowstone, sea lantern, torch, redstone torch, redstone lamp, enchanting table, lit furnace and soul torch. Lit Furnace and Soul Torch are in the creative functional-blocks tab. Ordinary furnaces stay unlit; the existing redstone lamp remains always on (there is no redstone power simulation).

Emission strengths follow the [Minecraft light-emission reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_light_emission?view=minecraft-bedrock-stable). This implements the game's catalog, not every block/conditional state in the full Minecraft Wiki category.

The eight nearest exposed block lights within 40 blocks illuminate terrain, mobs, pickups and water and cast filtered shadows. Other emitting blocks remain visibly emissive. This fixed budget avoids allocating a six-face shadow map for every torch or lava voxel. Sun shadows cover a 64-block square around the player, with a warm yellow sun disc. Change `MAX_BLOCK_LIGHTS` in `src/lighting.js` to adjust the local-light budget.

Collectibles use actual block atlas textures or crossed item silhouettes, bob and rotate, and wait one second before pickup. Breaking grass drops a brown dirt block; logs preserve their wood textures. TNT has its own textured fuse animation, smoke, a brief light flash, an expanding pressure ring, sparks and textured debris. Temporary explosion meshes are removed after their animation.

With the development server running, open `/tests/visual-effects.html` for a reproducible day/night, pickup and TNT preview. **Blast snapshot** freezes the real explosion update shortly after detonation for inspection.

## Flowing water and buckets

Water now has sources (level 0), seven diminishing horizontal flow levels, and falling water. Updates run every 0.25 seconds, prefer falling and nearby downhill paths, stop at solid walls, and resume when a wall or floor breaks. Streams retract when their supply is removed; two adjacent sources can regenerate a source above a solid block or another source. These are based on the [Minecraft Wiki fluid rules](https://minecraft.wiki/w/Fluid). Like Minecraft, source blocks provide an infinite supply: breaking a tank releases a stream rather than emptying a finite reservoir.

Right-click a supporting block with a water bucket to pour; right-click source water with an empty bucket to collect it. Flowing water cannot fill a bucket. Survival exchanges one bucket at a time, while creative keeps its bucket. Streams have sloping surfaces, directional ripples, and currents that move players and floating pickups. Water washes away flowers/torches and solidifies the game's existing source lava into obsidian.

Water levels are saved alongside voxel data. Older saved aquariums/oceans load as source water and respond to newly opened holes. Fluid updates operate on loaded chunks, resume at newly loaded boundaries, and use a work budget to avoid blocking the browser. This implements core water behavior; it does not add Minecraft's absent systems such as waterlogging, bubble columns, or a full lava-flow simulation.

Open `/tests/water-flow.html` on the development server to test aquarium breaches, buckets and drainage. The buttons use the production simulation and bucket code.

## Automated tests

`npm test` runs regression tests with mocked Gemini responses and the real voxel execution code. Requires Node.js 22 or later with `--test-isolation=none` support (tested with Node.js 24).

`npm run build` creates the production bundle. The automated tests do not make billable API requests; live Gemini quality and account access require a configured key.

## World loading progress

Generating a new world and loading a save both show a progress overlay with a
percentage and the current stage ("Generating terrain — chunk 40/81", "Building
meshes", "Decoding chunks"). The start button stays disabled until generation
finishes, so you are never dropped into a half-built world.

This is not just cosmetic. The work used to run as one synchronous block, which
meant the browser had no chance to repaint: the start screen simply froze for a
few seconds with no feedback. Terrain generation and meshing are now split into
batches with a real yield to the browser between them, so the bar actually
advances. `deserializeWorld()` remains synchronous for its callers and tests, but
reports progress through an optional hook; the overlay is painted before that
blocking call starts. See `src/progressOverlay.js`.
