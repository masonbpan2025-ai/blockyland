# Voxel Dash

Open **Designed Worlds → Voxel Dash • Five Biomes**. All five original Geometry Dash object layouts are available, with Minecraft biome scenery. Space, Up, W, click or tap jumps; hold for repeated cube jumps or ship ascent. P/Escape pauses, R retries. Enable Practice, then press C anywhere to save a checkpoint, including during flight. Practice finishes do not earn stars. Progress is stored separately from the old generated remix courses.

| Level | Rating | Biome |
| --- | --- | --- |
| Back On Track | Easy · 2 stars | Sunlit Meadow |
| Polargeist | Normal · 3 stars | Frozen Peaks |
| Dry Out | Normal · 4 stars | Redstone Badlands |
| Base After Base | Hard · 5 stars | Lush Caverns |
| Can't Let Go | Hard · 6 stars | The End |

The v2 courses use the archived original-level dataset from gd.py 0.11.0. Gameplay object centers, types, flips, rotations and scales are retained. The ship points forward and pitches with its trajectory. Clear floors, ceilings and horizontal platform surfaces allow sliding; spikes, black pit hazards and side impacts remain fatal. The camera follows elevated and inverted cube sections.

See [RESEARCH.md](RESEARCH.md) for sources, reproducible import, object mappings, numerical physics references and explicit fidelity limits. This is an unofficial browser adaptation of the original layouts, with synthesized music and procedural Minecraft artwork. It is not the native Geometry Dash engine or original soundtrack.

Rules run in the shared authoritative worker, at fixed 240-Hz physics steps. The engine owns the view lifetime and frame loop. Exiting disposes worker, audio, DOM and listeners.

Validation: `node --test --test-isolation=none tests/voxelDash.test.js`, `npm run test:mods`, `npm run build`. Course search/replay: `node scripts/verify-voxel-dash-courses.mjs`. To reimport: `node scripts/import-geometry-dash-levels.mjs path/to/official_levels.json`.
