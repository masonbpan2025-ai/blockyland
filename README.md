# Minecraft in the browser

Run `npm install` and `npm run dev`, then open http://localhost:3000.

## Gemini world editing

Press **C**, open **API Key**, and save a valid Google Gemini API key. The key is stored in this browser's localStorage and requests go directly to Google. The status shows **GEMINI READY** when a key is configured (connection is checked when a request runs).

Every prompt is sent to Gemini with recent conversation turns, stable structure IDs, names, positions, attachments, and current block data. Examples:

- “Build a lighthouse overlooking the water.”
- “Replace its stone walls with brick, keeping the windows.”
- “Add a viewing platform to the lighthouse.”
- “Destroy the lighthouse.”

The planner supports custom voxel builds, edits in place, removal, stairs, water, mobs, weather, time, inventory, and compound requests. It can answer or ask for clarification when a request cannot be represented by the available game actions. It does not execute model-generated JavaScript.

Structures track the blocks they change, including foundations and attachments. Removal restores the original blocks while preserving later player changes whose block values differ. Memory lasts for the current world session; reloading resets both the world and agent memory. Large structure snapshots are explicitly marked when truncated.

Without a key, the status shows **OFFLINE**. This mode provides limited preset commands, including “build a lighthouse” followed by “destroy the lighthouse” or “destroy it”. It is not a language model. Free-form requests need a working Gemini connection. API errors remain visible and never silently execute an offline substitute.

The default model is `gemini-3.8-flash`, from Google's [model catalog](https://ai.google.dev/gemini-api/docs/models). To use another compatible model, set `VITE_GEMINI_MODEL` in `.env.local` and restart Vite. The request follows the [generateContent API](https://ai.google.dev/api/generate-content).

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
