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

## Checks

`npm test` runs regression tests with mocked Gemini responses and the real voxel execution code. Requires Node.js 22 or later with `--test-isolation=none` support (tested with Node.js 24).

`npm run build` creates the production bundle. The automated tests do not make billable API requests; live Gemini quality and account access require a configured key.
