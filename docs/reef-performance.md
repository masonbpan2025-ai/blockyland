# Warm Ocean / Reef Life performance

Measured on 2026-10-10, Windows, Node 24.14.1, headless Chrome 154.0.8037.95.
These changes preserve reef density, mob caps, view distance, textures, and shader settings.
Baseline means the working checkout before these optimizations, including its existing sea-plant changes,
not an older Git commit. Captured implementations live in `tests/fixtures/reefBefore` and `tests/helpers/reefMob*Baseline.js`.

## What changed

- **Fluid simulation:** sea plants are waterlogged source cells, not floodable land plants. Water no longer erases them or creates drops/remeshing/relighting from that erasure. Chunk initialization only queues actual downward/lateral outlets or flowing water. Air above an ocean and source-filled chunk seams no longer wake thousands of stable cells. Real spills, source removal, waterfalls, and newly loaded open boundaries still propagate.
- **Meshing:** the padded voxel buffer now matches the world's 16-bit block IDs. Previously coral and sea-plant IDs above 255 were truncated, producing incorrect occlusion and hidden geometry. Per-build water-corner height/depth/tint and current caches reuse repeated vertex samples without changing ordinary water geometry or chunk seam behavior.
- **Mob separation:** cache dimensions once per active mob per call, and reject distant pairs early. Keep the original two passes, pair order, live positions, wall checks, baby/puffed hitboxes, and coincident-position handling.
- **Aquatic AI:** reuse temporary vectors and ordered candidate-coordinate storage; create only the selected target vector. Resolve collision dimensions once per swim update. Preserve candidate order, all collision checks, random draws, target ownership, and movement.
- **Pufferfish:** scan threats without building a fresh population array; preserve player-first ties, strict ranges, and the axolotl exception.

## Browser measurements

Default view radius 8; seed 12345; Reef Life; Warm Ocean; creative mode; 1280×720; optional shader off in both runs.
Both start with **289 chunks, 29,499 sea plants, 5,482 coral blocks, and 1,926 mobs**.
Streaming expands to 361 chunks; normal despawning brings the nearby population to approximately 530–540.
World population uses JavaRandom seed 4242; other randomness uses a seeded generator.

| Metric | Before | After | Reduction |
|---|---:|---:|---:|
| Surface mean frame interval | 101.41 ms | 79.33 ms | 21.8% |
| Surface p95 frame interval | 161.30 ms | 104.40 ms | 35.3% |
| Underwater mean frame interval | 135.73 ms | 88.27 ms | 35.0% |
| Underwater p95 frame interval | 194.00 ms | 119.90 ms | 38.2% |
| Underwater mean draw calls | 4,005 | 2,331 | 41.8% |
| Pending fluid cells after underwater segment | 676,049 | 0 | 100% |

The loop measures the production mob, spawning, water, streaming, dirty-mesh, lighting, texture, raycast, and render methods,
using fixed 1/60-second simulation steps and real requestAnimationFrame scheduling. Each viewpoint runs 150 frames;
the first 30 are excluded from frame/render-work statistics. Component timings include those first 30 and are nested/inclusive,
so their totals must not be added. The two segments cover five seconds of simulated time and include startup/streaming churn.

This is a controlled browser workload, **not the complete `Game.animate` loop or a promise of desktop FPS**.
It omits player input, UI, weather, and other gameplay managers. Headless graphics and background machine activity strongly affect absolute timings.
Both runs completed without uncaught browser errors. Raw data: [before](reef-browser-before.json), [after](reef-browser-after.json).

Do not infer a loading-screen speedup from this pair: total generation wall time was 18.02 s before versus 29.90 s after,
with substantial variation in rendering and even unchanged relighting. The isolated, interleaved CPU benchmark below is the more reliable comparison for generation/meshing work.

## Deterministic CPU and geometry measurements

Real terrain and Three.js geometry, seed 12345, 25 chunks, Reef Life. Alternate before/after execution within one Node process;
discard two warm-up rounds per implementation, then take the median of five rounds. Fluid measurement processes 40 bounded ticks;
it excludes downstream remeshing, lighting, item spawning, and rendering, so it understates the eliminated churn.

| Metric | Before | After | Reduction |
|---|---:|---:|---:|
| Chunk generation CPU | 101.43 ms | 74.56 ms | 26.5% |
| Mesh all 25 chunks | 200.10 ms | 155.28 ms | 22.4% |
| Forty fluid ticks | 68.715 ms | 0.0127 ms | >99.9% |
| Water triangles | 23,342 | 18,424 | 21.1% |
| Total triangles | 87,078 | 82,740 | 5.0% |
| Initial fluid queue | 48,697 | 0 | 100% |
| Fluid block mutations | 2,946 | 0 | 100% |
| Lost sea plants, of 2,595 | 2,386 | 0 | 100% |
| Chunks dirtied by fluid | 25 | 0 | 100% |

Raw samples: [CPU/geometry report](reef-cpu-benchmark.json).
Independent mob comparisons are in [the mob CPU report](reef-mob-cpu.json): nine alternating samples after warm-up,
with exact state/RNG parity checked alongside timing. These are subsystem speedups, not frame-rate multipliers.

| Mob workload | Before median | After median | Result |
|---|---:|---:|---:|
| Collision, 500 spread mobs | 10.06 ms | 1.52 ms | 6.6× faster |
| Collision, 500 crowded mobs | 11.38 ms | 3.72 ms | 3.1× faster |
| Collision, 1,926 spread mobs | 141.09 ms | 28.45 ms | 5.0× faster |
| Full update, 530 real models / synthetic terrain | 32.19 ms | 22.08 ms | 31.4% less time |
| Full update, 530 mobs / forced target refresh | 39.30 ms | 26.79 ms | 31.8% less time |

Not every microbenchmark improved: isolated steady swimming measured 0.715 → 0.813 ms for 500 mobs;
target refresh improved 10.19 → 7.00 ms. Full-update improvements include collision savings.
The full-update comparison uses real constructed models with synthetic voxel lookups, not generated terrain or rendering,
and both versions use the current pufferfish dispatcher, making that comparison conservative for threat-allocation savings.

## Open-source implementations reviewed

- [Luanti's liquid simulation](https://github.com/luanti-org/luanti/blob/master/src/servermap.cpp): distinguishes floodable nodes from other nodes, maintains a bounded transformation queue, and excludes upward neighbors when scheduling flow. Those principles informed the selective outlet scheduling and plant-preservation fix; this is not a port of Luanti's liquid model.
- [noa's terrain mesher](https://github.com/fenomas/noa/blob/master/src/lib/terrainMesher.js): typed caches, full block-ID comparisons, early rejection of internal faces, and reused face data. Applied the relevant ID/culling and reuse principles here; no new greedy-meshing algorithm was added.
- [noa's entity collider](https://github.com/fenomas/noa/blob/master/src/components/collideEntities.js): broad-phase box intersection before cylinder checks. This highlights the next scaling opportunity. This patch deliberately retains existing collision ordering rather than introducing a different broad phase with potentially different crowded-school behavior.

## Verification and reproduction

Added **19 regression tests** in `tests/reefPerformance.test.js` and `tests/reefMobOptimization.test.js`:
plant survival/no drops/no dirtiness, stable source queues, renewable water, 16-bit interior/seam culling including negative coordinates,
resumable reef mesh equality, collision trajectory parity, dynamic sizes/babies/riders/walls, threat ties/ranges/exclusions,
aquatic candidate/RNG/collision-query parity, and full updates with real reef models.
Also ran the existing fluid/lava, ocean-plant, mesher parity/performance/time-slicing, wildlife, spawning construction,
fish/squid/dolphin, collision/breeding, streaming, bucket, movement, world-cache, numeric-ID, shader, and isolation suites.
Production build passed (existing large-bundle/dynamic-import warnings remain).

```powershell
node --test --test-isolation=none tests/reefPerformance.test.js tests/reefMobOptimization.test.js
node scripts/bench-reef.mjs
node scripts/bench-reef-mobs.mjs --output docs/reef-mob-cpu.json
# In another terminal:
npx vite --host 127.0.0.1 --port 3027 --strictPort
node scripts/bench-reef-browser.mjs --before --output docs/reef-browser-before.json
node scripts/bench-reef-browser.mjs --output docs/reef-browser-after.json
```

Residual costs: mob separation and pufferfish scans remain quadratic, and many individually rendered animated mob parts still generate substantial draw overhead.
The changes materially reduce early reef lag; they do not establish a 60 FPS guarantee at default distance.
Sea plants already erased in an old save are not reconstructed automatically; fresh world generation retains them.
