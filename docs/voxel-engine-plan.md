# Voxel engine architecture: research notes, decisions and measured results

Findings from reading the source of Voxelize, noa, Luanti, prismarine-viewer and FastNoiseLite, what
this project did about each, and what is measured rather than assumed. Recorded so the decisions are
reviewable, and so a future change can tell whether it is contradicting a known tradeoff or repeating
a known mistake.

## Two framing corrections

- **noa is not a three.js engine.** Its mesher and rendering import Babylon
  (`@babylonjs/core/Meshes/mesh`, `RawTexture2DArray`, `MaterialPluginBase`). Its storage, meshing
  and streaming design transfers; its rendering code does not.
- **prismarine-viewer is a viewer, not an engine.** It has no voxel storage format of its own
  (delegates to `prismarine-chunk`) and no terrain generation at all. It is a reference for meshing,
  streaming and three.js rendering only.

Also worth stating plainly: **neither noa nor Voxelize uses binary greedy meshing**, despite both
citing 0fps.net. Both build material-ID masks and merge runs of equal value (plus AO, and in Voxelize's
case per-vertex light). Voxelize additionally made its mesher WASM and shares chunk memory through
`SharedArrayBuffer` when `crossOriginIsolated`.

## Where this stands, measured

Harness figures on the current code. Absolute times are unreliable while other work shares this
machine -- a run during a busy period measured 60ms/frame for a scenario that measures 11ms when quiet
-- so ratios matter more than absolutes, and figures come from repeated controlled runs.

| | at the start | now |
|---|---|---|
| `getVoxel` | 121 ns/call | **28 ns/call** |
| Generate 16 chunks | 117 ms | **48 ms** |
| Mesh one chunk | 44 ms | **14 ms** |
| Walk a chunk boundary at radius 4 | 365 ms | **87 ms** |
| View distance | 4 chunks | **8 chunks** |
| Chunks resident at radius 8 | unbounded, never unloaded | **399**, bounded |
| Live geometry on a long walk | 41.4 MB and growing | **6.5 MB**, bounded |

Walking continuously at view radius 8 with the real mesher: **11.5 ms/frame average, p50 13.4 ms,
p90 21.4 ms, p99 34.8 ms** against a 16.7 ms frame. The average is inside a frame; the tail is not.

Meshing is now interruptible, which roughly halves the frame-time distribution measured against the
one-shot path in the same process (both figures inflated by machine load; the ratio is the point):

| view radius 8 | avg | p50 | p90 | p99 | max |
|---|---|---|---|---|---|
| one-shot meshing | 40.9 ms | 34.8 ms | 73.3 ms | 341.5 ms | 758.2 ms |
| time-sliced | 26.7 ms | 17.7 ms | 40.4 ms | 216.6 ms | 380.4 ms |

## What was done, and the bug that made each earlier claim false

**A. Voxel access.** `getVoxel` is the hottest function in the engine -- the mesher calls it six times
per non-air voxel for face culling plus up to eight more for ambient occlusion, roughly 130,000 lookups
per chunk -- and it did two `Math.floor`s, built a template string and hit a `Map` every call. A
direct-mapped slot array now fronts the `Map`, and local coordinates use a bitmask instead of a
modulo. **121 -> 28 ns/call.** The `Map` stays authoritative and `chunkKey` stays a string, because
tests and several modules write chunks into `world.chunks` directly with string keys; a missing chunk
is never cached, because it may be generated moments later. 11 tests in `tests/worldChunkCache.test.js`.

**B. Meshing.** Twice. First the chunk plus a one-block border is copied into a flat scratch array once
per mesh, so face and AO sampling is array indexing rather than ~14 world lookups per visible face. Then
the inner loop was made allocation-free: the per-voxel neighbour object, the per-voxel `addFace`
closure, the per-face corner arrays, the `positions.map` on the water path and a
`new Array(4).fill()` spread were replaced by static tables (`FACE_CORNERS`, `FACE_NORMAL`,
`AO_OFFSETS`) and one reusable scratch array. A CPU profile had put ~30% of sampled time in
`meshChunk` and 14% in `addFace`, with 5.5% in garbage collection. **44 -> 26 -> 14 ms/chunk**, with
parity asserted exactly: `tests/mesherPerformance.test.js` imports the previous mesher as a fixture and
compares every attribute and index of every geometry. 11 further tests in `tests/mesherParity.test.js`
pin culling and seam behaviour.

One regression was caught by an existing test here and is worth recording: the original applied the
`topY`/`botY` surface substitution BEFORE deciding whether to lower a corner for water, so on the
top face every corner is on the top plane and every corner gets the water surface lookup. The rewrite
tested the raw corner first, which skipped half of them and flattened the water surface -- heights
collapsed to a single 1.900 where the previous mesher produced 1.028 through 1.855.

**C. Streaming.** `src/chunkStreamer.js`: nearest-first ordering, a generate ring one wider than the
mesh radius, meshing gated on all eight neighbours existing, and unloading beyond `meshRadius + 3`
with neighbour invalidation. It also removes a per-frame cost that scaled with the loaded world:
`refreshDirtyChunks` used to allocate and sort an array of every loaded chunk on every frame.

Two bugs here, both of which made an earlier "done" claim false:

- **Unloading never fired while walking.** The distance test ran against the MESHED set, whose members
  by definition all lie inside the mesh radius, so `distance > unloadRadius` could never be true. Over
  a 2400-frame walk crossing 82 chunks that left 1002 chunks resident and 41.4 MB of live geometry;
  after the fix, 143 chunks and **6.5 MB**, with the bound no longer depending on how far the player
  travels. A single-jump test had passed by accident.
- **The budget bounded each phase, not the frame**, and was consulted only *after* an operation
  finished, so a frame that had already spent 5 ms could still begin a chunk costing 25 ms. 120 of 901
  mesh operations exceeded their supposed 8 ms budget; the worst single chunk was 38.9 ms.

Streaming now keeps a moving estimate of one generate and one mesh and declines to *start* work that
would overrun a single shared per-frame budget, with the first operation of a phase always allowed so
progress cannot deadlock.

**D. Procedural generation.** Trees were placed on a per-chunk grid, so every trunk sat on a local
multiple of 4 and the same pattern repeated in every chunk, and because leaf writers only accepted
in-chunk coordinates a tree near a seam would have been truncated -- so the code refused to place one
there at all, leaving a bare three-block margin around every chunk. Placement is now a global
spacing-4 grid in WORLD coordinates with a deterministic jitter, and every chunk draws every canopy that
overlaps it, clipped to itself, so no chunk depends on a neighbour having been generated first.

Separately, **world generation was not deterministic**: eight generators called `Math.random` for tree
shape, and trunk placement asked whether the ground beneath was solid -- a question whose answer changes
once a neighbouring tree's canopy exists. That made a chunk contain different blocks depending on which
neighbour was generated first. Every `Math.random` is now a seeded stream carried on the writer each
tree already receives; the per-tree decision reads only world coordinates, biome and terrain height; and
trunks are written before canopies. Generating in forward, reverse and shuffled order now produces
byte-identical blocks. 12 tests in `tests/treePlacement.test.js`.

Also fixed: tree placement used the raw `getHeight` while the terrain pass clamped to
`CHUNK_HEIGHT - 6`, so on high ground a trunk began above the surface and floated. Both now call
`surfaceHeightAt`.

**E. Scene graph -- measured and rejected.** three.js walks every node of the scene every frame
regardless of whether it changed, and Voxelize treats this as significant, solving it with a
`StaticGroup` that skips a settled subtree. `scripts/bench-scene.mjs` reproduces that walk exactly and
measures **0.061-0.104 ms at 1089 chunk meshes** -- about 0.6% of a frame. The technique does not pay
for itself here, so it was not added. Measuring first avoided writing code that would not have helped.

## What is still not done, and why

**The frame is not hard-bounded.** p99 is 34.8 ms and the worst frame reaches 75-140 ms. Generation and
meshing are atomic per chunk, so no pre-check can bound a frame below the cost of the single most
expensive chunk (p99 16.5 ms, max 38.9 ms). The fix is to time-slice *inside* the mesh loop so one chunk
can be finished across frames. **This is the next thing to do and everything else is worth less.**

**Draw calls are unmeasured and unbatched.** One mesh per chunk per material means ~340 draw calls at
radius 8. Voxelize batches the opaque bucket into one `BatchedMesh` per 8x8-chunk region; Luanti merges
same-material buffers at draw time. Neither can be evaluated here: the CPU harness cannot measure draw
calls, so this needs a real browser profile or a headless GL context before any work is justified. That
is the honest position, not an argument for skipping it.

**FastNoiseLite is not adopted.** The npm registry is unreachable from this sandbox, so it would need
vendoring from source. The configuration below is a genuine improvement over the hand-rolled simplex in
`world.js`, but it is a swap rather than a fix for anything currently broken, and terrain generation is
already deterministic.

**Structures still cannot span chunk borders.** Trees can now; the structure generators are a separate
path and still write within their own chunk.

**Frustum culling** is partly free already, since three.js does a per-mesh bounding-sphere test.

## The storage and meshing decisions, and what each project chose

| | Voxelize | noa | Luanti | prismarine-viewer |
|---|---|---|---|---|
| Mesh unit | 16x32x16 sub-chunk | 24^3 | 16^3 block, 32^3 mesh cell | 16^3 section |
| Voxel word | u32 bitfield + u32 light | u16 id | 4 B (u16 + 2 param) | palette (prismarine-chunk) |
| Vertex size | **21 B** | ~60 B | ~40 B | ~44 B |
| Meshing | greedy, 6 sweeps | greedy, 6 sweeps | **per-face** | **per-face** |
| Texture binding | atlas + shader repeat | **texture array** | atlas + optional array | single atlas |
| Draw-call strategy | BatchedMesh arenas per 8x8 region | one mesh per (chunk, material) | merge same-material buffers at draw | one mesh per section |
| Occlusion culling | yes (Sodium-style) | **none** | yes (BFS + raytraced) | **none** |
| Off main thread | WASM workers | **no -- 3-5 ms budgets** | native threads | 4 JS workers, 50 ms drain |

### The five contested decisions

1. **Greedy vs per-face.** Greedy cuts quads enormously on flat terrain (roughly an order of magnitude
   on a plain) but forces AO and light into the merge key, so runs break at every shading discontinuity
   and the win largely evaporates on rough terrain. It also breaks plain 0..1 UVs, needing either tiling
   UVs (noa, which is why it uses a texture array) or shader-side repeat reconstruction from world
   position (Voxelize). Both projects still needed a non-greedy path for fluids, plants and animated
   blocks. Luanti and prismarine-viewer chose per-face and recovered the draw-call cost by merging at
   *draw* time rather than at build time.
2. **Vertex size.** The highest-confidence win available: 21 B vs 60 B is ~2.9x less vertex memory and
   bandwidth for identical geometry, purely from packing (u16 biased position, u16 normalised UV, i8
   normal, packed i32 light). The non-obvious requirement is that dequantisation scale and bias must
   live in the **mesh matrix**, not the shader, or a single-overrideMaterial shadow pass breaks -- and
   any geometry the main thread re-sorts must stay f32, so materials must be partitioned by vertex
   format.
3. **Atlas vs texture array.** A texture array is strictly better at the shader level: no bleeding,
   tiling UVs work natively, no per-face UV maths. Luanti instruments array-texture usage as a
   percentage of material swaps, treating it as a runtime capability. `texture2DArray` is core in
   WebGL2, so an array should be the default for a modern browser target.
4. **Workers vs budgets.** noa shipped a widely-deployed voxel game (classic.minecraft.net) with
   **zero** worker meshing, purely by capping main-thread work at 3-5 ms/frame. All three projects that
   do use workers still budget the main-thread *apply* step, because building geometry off-thread does
   not help if uploading it is unbudgeted.
5. **Chunk size and view distance are one decision.** noa's [2,2] add distance at chunkSize 24 is 33
   chunks and ~48 blocks of view -- a mobile-first working set. Voxelize's radius 6 on a 16x256 column
   is ~133 columns and ~68 MB. You cannot pick a meshing strategy without picking the resident set size,
   because that determines whether main-thread meshing is viable at all.

## Known mistakes in the reference projects, worth not repeating

- **noa masks its chunk hash to 10 bits per axis**, so it silently aliases beyond +/-1024 chunks
  (+/-12,288 blocks at chunkSize 24). Documented in their source, but a hard cap.
- **noa's default chunkSize 24 is not a power of two**, so it takes the Math.floor/modulo path and never
  uses the bit-shift fast path the code explicitly provides for power-of-two sizes.
- **prismarine-viewer never dirties a neighbour section on column unload** -- only on load and on
  boundary block edits -- so faces culled against a removed column stay culled. This project dirties
  neighbours on unload as well.
- **Luanti's default map generators are not thread-safe** across emerge threads (only singlenode is, by
  default, per issue #9357). Parallel worldgen is not a solved problem to copy.
- **Luanti's BFS occlusion culler degrades past wanted_range / mesh_cell >= 500** and falls back to an
  O(n^3) loops culler (issue #13345); it is disabled entirely for mesh cells >= 4 blocks. Voxelize's
  approach -- consuming a connectivity bitmask the mesher already produced -- scales better.
- **prismarine-viewer's World.getBlock() returns a shared mutated object**, valid only until the next
  call. An allocation-avoidance hack that is a footgun unless the convention is documented.
- **Luanti's monoblock compression is disabled on the client** due to known data races, i.e. that
  compression is only safe where the data has a single owner.
- **Luanti truncates its map seed to s32**, with an unusually honest comment: "We are losing half our
  entropy by doing this... 4.2 billion possibilities ought to be enough for anyone."

## World generation: the order of operations that works

Luanti's MapgenV7::makeChunk is the clearest reference sequence, and the reasons are worth keeping:

1. Over-generate the working area by **1 block down and 2 blocks up**, so decoration and cave passes
   have real neighbour data.
2. Terrain from a **2D heightmap**, computed entirely from 2D noise.
3. Heightmap update.
4. Biome noise + biome application.
5. **Tunnels before caverns** -- their comment: "Generate tunnels first as caverns confuse them."
6. Caverns.
7. Large caves, **disabled near caverns** to avoid "excessive liquid in large caverns and floating
   blobs of overgenerated liquid."
8. Ores. 9. Dungeons. 10. Decorations. 11. dustTopNodes -- "Sprinkle some dust on top after everything
   else was generated." 12. Liquid flow queue. 13. Lighting last.

The shape mechanism is a **hybrid of 2D heightmap and 3D density**, and the cheap trick that makes 3D
noise usable is a **vertical gradient added to the 3D sample**:

    mountn + density_gradient >= 0,  where density_gradient = -(y - mount_zero_level) / max(mounthn, 1)

Biome classification is **Whittaker heat x humidity plus surface height** -- not Voronoi, no jitter.
Noise parameters are (offset, scale, spread, octaves, persist, lacunarity) where spread is the per-octave
wavelength in blocks. Notable: np_terrain_persist *drives the persistence of other noise fields per
position*, and np_floatland uses **lacunarity 1.618 (the golden ratio)** to break octave alignment and
hide the harmonic look that lacunarity 2.0 produces. Caves are gated by cost: cave_width >= 10 disables
generation entirely to "avoid the intensive 3D noise calculations".

## FastNoiseLite specifics that matter here

- Noise types: OpenSimplex2, OpenSimplex2S, Cellular, Perlin, ValueCubic, Value. There is **no classic
  Simplex**. JS enum values match the C++ declaration order.
- Fractals: None, FBm, Ridged, PingPong, plus two domain-warp-only variants.
- **SetFrequency is the reciprocal of feature size.** The default 0.01 means one noise cell spans ~100
  input units, and is the most common cause of "my terrain is flat".
- **SetRotationType3D(ImproveXZPlanes) is the key knob for voxel terrain** -- sampling a heightmap with
  3D noise at a fixed y otherwise produces visible axis-aligned grid artifacts.
- _FractalBounding is recomputed **only** by the octaves and gain setters, so those must be set before
  relying on the -1..1 output range. Changing lacunarity does not affect it.
- Cost, from their C++ benchmarks: **Value and Perlin are 1.3-1.7x faster than OpenSimplex2**, and
  **Cellular is 3-5x slower than Value**. Cellular must never be used for per-voxel density.
- The JS port (fastnoise-lite, 1.1.1) has **no batch/grid API** -- there is no equivalent of Luanti's
  Noise class, which preallocates a per-chunk plane and fills a whole 2D slice in one call. Amortisation
  must be written here.
- The published tarball has **no .d.ts and no FastNoiseLite.min.js** despite jsDelivr listing both.
  node_modules/fastnoise-lite/FastNoiseLite.js is the real entry point.
- Method names are PascalCase (SetNoiseType, GetNoise), and DomainWarp(coord) mutates in place.

## Benchmark harness

- `node scripts/bench-world.mjs [--json]` -- getVoxel ns/call, terrain generation, per-chunk meshing,
  walking cost per view radius, view-area footprint, and mesh vertex counts so a change can be shown not
  to have altered geometry.
- `node scripts/bench-scene.mjs [--json]` -- the per-frame scene-graph walk, and why skipping a settled
  subtree was rejected.
- `node scripts/make-mesher-fixture.mjs` -- regenerates `tests/fixtures/mesherBefore.js`, the previous
  mesher, used by `tests/mesherPerformance.test.js` for exact parity and for the speed ratio.

Both benchmarks run headless on the real three.js via `scripts/bench-dom-shim.mjs`. Stubbing three was
attempted and abandoned: Node resolves the real package anyway, and the real library needs only a small
DOM shim.

**They are only trustworthy on a quiet machine.** Back-to-back runs under load varied from 20 to 40 ms
per chunk, and one run reported 60 ms/frame where a quiet run reports 11 ms -- wider than most changes
being measured. Take figures from repeated runs when nothing else is competing for CPU, and prefer
medians and minimums over means.
