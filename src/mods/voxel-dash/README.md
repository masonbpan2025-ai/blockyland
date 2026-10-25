# Voxel Dash

Open **Designed Worlds → Voxel Dash • Eleven Biomes**. Eleven original Geometry Dash object layouts are available, levels 2 to 12 of the game, with Minecraft biome scenery. Space, Up, W, click or tap jumps; hold for repeated cube jumps or ship ascent. As a ball, a press rolls you to the other side; as a UFO, each press flaps once. P/Escape pauses, R retries. Enable Practice, then press C anywhere to save a checkpoint, including during flight. Practice finishes do not earn stars. Progress is stored separately from the old generated remix courses.

| # | Level | Rating | Biome | New in it |
| --- | --- | --- | --- | --- |
| 2 | Back On Track | Easy · 2 stars | Sunlit Meadow | |
| 3 | Polargeist | Normal · 3 stars | Frozen Peaks | yellow orbs |
| 4 | Dry Out | Normal · 4 stars | Redstone Badlands | gravity portals |
| 5 | Base After Base | Hard · 5 stars | Lush Caverns | |
| 6 | Can't Let Go | Hard · 6 stars | The End | |
| 7 | Jumper | Harder · 7 stars | Jungle Canopy | |
| 8 | Time Machine | Harder · 8 stars | Deep Dark | mirror portals, pink orbs |
| 9 | Cycles | Harder · 9 stars | Nether Wastes | ball |
| 10 | xStep | Insane · 10 stars | Mushroom Fields | blue orbs, gravity pads everywhere |
| 11 | Clutterfunk | Insane · 11 stars | Abandoned Mineshaft | mini size, sawblades |
| 12 | Theory of Everything | Insane · 12 stars | Stronghold | UFO |

The courses use the archived original-level dataset from gd.py 0.11.0. Gameplay object centers, types, flips, rotations and scales are retained. The ship points forward and pitches with its trajectory. Clear floors, ceilings and horizontal platform surfaces allow sliding; spikes, black pit hazards, sawblades and side impacts remain fatal. The camera follows elevated and inverted cube sections. A mirror portal turns the view round; it changes nothing else.

See [RESEARCH.md](RESEARCH.md) for sources, reproducible import, object mappings, numerical physics references and explicit fidelity limits. This is an unofficial browser adaptation of the original layouts, with synthesized music and procedural Minecraft artwork. It is not the native Geometry Dash engine or original soundtrack.

Rules run in the shared authoritative worker, at fixed 240-Hz physics steps. The engine owns the view lifetime and frame loop. Exiting disposes worker, audio, DOM and listeners.

Validation: `node --test --test-isolation=none tests/voxelDash.test.js`, `npm run test:mods`, `npm run build`. Course search/replay, every level or one by index: `node scripts/verify-voxel-dash-courses.mjs [index]`. To reimport: `node scripts/import-geometry-dash-levels.mjs path/to/official_levels.json`.
