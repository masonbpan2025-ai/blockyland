# Lightweight mob inspector

Run `npm run dev`, then open http://localhost:3000/mob-debug.html?mob=blaze.
The page also ships in the production build. It never imports the game entry point,
creates terrain chunks, generates a map, or reads/writes saved worlds.

The inspector uses the production MobManager, texture generators, physics, AI and
projectile updates with a flat sparse world adapter. Select any of the 48 available
mobs, orbit/zoom/pan, or return to the front view. Switch between neutral lighting
and an approximate Nether tint to distinguish texture problems from illumination.

Inspect mode has no valid player target. Combat mode supplies a survival dummy.
Pause and Step advance the same production simulation; simulation speed can be
changed without changing its fixed 1/60-second step. Hit tests the real damage
flash and Kill tests death/splitting; drops and XP are recorded in Events. Water
and lava immersion use actual voxel queries, without fluid/world generation.

Live telemetry displays health, position, velocity, grounding, attack phase,
projectiles, and target health. Exceptions pause simulation and remain visible.
Each mob has a wiki link; Blaze and Magma Cube have explicit comparison checklists.
These are manual inspection criteria, not an automatic claim of complete parity.

Limitations: the dummy records raw hits, without real player armor/shields or
status-effect ticking. Lighting approximates Nether tint and does not load the
game's sky, postprocessing, shadows, weather, audio or environmental particles.
Only the mob's own geometry/effects are previewed; loot is logged rather than
rendered. The isolated arena does not validate natural spawning or navigation
through generated terrain.

Tests: `node --test --test-isolation=none tests/mobDebugSession.test.js tests/netherCombat.test.js`
