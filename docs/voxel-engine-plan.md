# Voxel engine architecture: research notes and plan

Findings from reading the source of Voxelize, noa, Luanti, prismarine-viewer and FastNoiseLite, and
what this project intends to do about each. Recorded so the decisions are reviewable and so a
future change can tell whether it is contradicting a known tradeoff or repeating a known mistake.

## Two framing corrections

- **noa is not a three.js engine.** Its mesher and rendering import Babylon
  (`@babylonjs/core/Meshes/mesh`, `RawTexture2DArray`, `MaterialPluginBase`). Its storage, meshing
  and streaming design transfers; its rendering code does not.
- **prismarine-viewer is a viewer, not an engine.** It has no voxel storage format of its own
  (delegates to `prismarine-chunk`) and no terrain generation at all. It is a reference for
  meshing, streaming and three.js rendering only.

Also worth stating plainly: **neither noa nor Voxelize uses binary greedy meshing**, despite both
citing 0fps.net. Both build material-ID masks and merge runs of equal mask value (plus AO, in
Voxelize's case, and light). Voxelize additionally made its mesher WASM and shares chunk memory via
`SharedArrayBuffer` when `crossOriginIsolated`.

## Measured baseline of THIS project

From `node scripts/bench-world.mjs`, before any optimisation:

| Measurement | Baseline |
|---|---|
| `getVoxel` | **121 ns/call** |
| Terrain generation, 16 chunks | 117 ms |
| **Meshing, per chunk** | **44 ms** (2.6 frames of a 60fps budget) |
| Walking one chunk boundary, radius 4 | **365 ms** (25 dropped frames) |
| Walking one chunk boundary, radius 8 | 716 ms |

For scale: a 60fps frame budget is 16.7 ms, and meshing a single chunk costs nearly three of them.
The view radius is currently **4 chunks (81 chunks, 1.3M voxels)**, against prismarine-viewer's 6,
Voxelize's 6 and Luanti's 200-node range with a 2-block mesh grid.

## The storage and meshing decisions, and what each project chose

| | Voxelize | noa | Luanti | prismarine-viewer |
|---|---|---|---|---|
| Mesh unit | 16×32×16 sub-chunk | 24³ | 16³ block, 32³ mesh cell | 16³ section |
| Voxel word | u32 bitfield + u32 light | u16 id | 4 B (u16 + 2 param) | palette (prismarine-chunk) |
| Vertex size | **21 B** | ~60 B | ~40 B | ~44 B |
| Meshing | greedy, 6 sweeps | greedy, 6 sweeps | **per-face** | **per-face** |
| Texture binding | atlas + shader repeat | **texture array** | atlas + optional array | single atlas |
| Draw-call strategy | `BatchedMesh` arenas per 8×8 region | one mesh per (chunk, material) | merge same-material buffers at draw | one mesh per section |
| Occlusion culling | yes (Sodium-style) | **none** | yes (BFS + raytraced) | **none** |
| Off main thread | WASM workers | **no — 3–5 ms budgets** | native threads | 4 JS workers, 50 ms drain |

### The five contested decisions

1. **Greedy vs per-face.** Greedy cuts quads enormously on flat terrain (roughly an order of
   magnitude on a plain) but forces AO and light into the merge key, so runs break at every shading
   discontinuity and the win largely evaporates on rough terrain. It also breaks plain 0..1 UVs,
   needing either tiling UVs (noa, which is why it uses a texture array) or shader-side repeat
   reconstruction from world position (Voxelize). Both projects still needed a non-greedy path for
   fluids, plants and animated blocks. Luanti and prismarine-viewer chose per-face and recovered the
   draw-call cost by merging at *draw* time rather than at build time.
2. **Vertex size.** The highest-confidence win available: 21 B vs 60 B is ~2.9× less vertex memory
   and bandwidth for identical geometry, purely from packing (u16 biased position, u16 normalised
   UV, i8 normal, packed i32 light). The non-obvious requirement is that dequantisation scale and
   bias must live in the **mesh matrix**, not the shader, or a single-`overrideMaterial` shadow pass
   breaks — and any geometry the main thread re-sorts must stay f32, so materials must be
   partitioned by vertex format.
3. **Atlas vs texture array.** A texture array is strictly better at the shader level: no bleeding,
   tiling UVs work natively, no per-face UV maths. Luanti instruments array-texture usage as a
   percentage of material swaps, treating it as a runtime capability. `texture2DArray` is core in
   WebGL2, so an array should be the default for a modern browser target.
4. **Workers vs budgets.** noa shipped a widely-deployed voxel game (classic.minecraft.net) with
   **zero** worker meshing, purely by capping main-thread work at 3–5 ms/frame. All three projects
   that do use workers still budget the main-thread *apply* step, because building geometry
   off-thread does not help if uploading it is unbudgeted.
5. **Chunk size and view distance are one decision.** noa's `[2,2]` add distance at `chunkSize 24`
   is 33 chunks and ~48 blocks of view — a mobile-first working set. Voxelize's radius 6 on a
   16×256 column is ~133 columns and ~68 MB. **You cannot pick a meshing strategy without picking
   the resident-set size**, because that determines whether main-thread meshing is viable at all.

## Known mistakes in the reference projects, worth not repeating

- **noa masks its chunk hash to 10 bits per axis**, so it silently aliases beyond ±1024 chunks
  (±12,288 blocks at `chunkSize 24`). Documented in their source, but a hard cap.
- **noa's default `chunkSize` 24 is not a power of two**, so it takes the `Math.floor`/modulo path
  and never uses the bit-shift fast path the code explicitly provides for power-of-two sizes.
- **prismarine-viewer never dirties a neighbour section on column unload** — only on load and on
  boundary block edits — so faces culled against a removed column stay culled. This project must
  dirty neighbours on unload as well as load.
- **Luanti's default map generators are not thread-safe** across emerge threads (only
  `singlenode` is, by default, per issue #9357). Parallel worldgen is not a solved problem to copy.
- **Luanti's BFS occlusion culler degrades past `wanted_range / mesh_cell >= 500`** and falls back
  to an O(n³) loops culler (issue #13345); it is disabled entirely for mesh cells ≥ 4 blocks.
  Voxelize's approach — consuming a connectivity bitmask the mesher already produced — scales
  better.
- **prismarine-viewer's `World.getBlock()` returns a shared mutated object**, valid only until the
  next call. An allocation-avoidance hack that is a footgun unless the convention is documented.
- **Luanti's monoblock compression is disabled on the client** due to known data races, i.e. that
  compression is only safe where the data has a single owner.
- **Luanti's `mapgen_limit` comment truncates the seed to s32**: "We are losing half our entropy by
  doing this… 4.2 billion possibilities ought to be enough for anyone."

## World generation: the order of operations that works

Luanti's `MapgenV7::makeChunk` is the clearest reference sequence, and the reasons are worth
keeping:

1. Over-generate the working area by **1 block down and 2 blocks up**, so decoration and cave passes
   have real neighbour data.
2. Terrain from a **2D heightmap**, computed entirely from 2D noise.
3. Heightmap update.
4. Biome noise + biome application.
5. **Tunnels before caverns** — their comment: "Generate tunnels first as caverns confuse them."
6. Caverns.
7. Large caves, **disabled near caverns** to avoid "excessive liquid in large caverns and floating
   blobs of overgenerated liquid."
8. Ores.
9. Dungeons.
10. Decorations (trees etc).
11. `dustTopNodes` — "Sprinkle some dust on top after everything else was generated."
12. Liquid flow queue.
13. Lighting last.

The terrain/shape mechanism is a **hybrid of 2D heightmap and 3D density**, and the cheap trick that
makes 3D noise usable is a **vertical gradient added to the 3D sample**:

```
mountn + density_gradient >= 0,  where density_gradient = -(y - mount_zero_level) / max(mounthn, 1)
```

Their biome classification is **Whittaker heat × humidity plus surface height** — not Voronoi, no
jitter. Noise parameters are `(offset, scale, spread, octaves, persist, lacunarity)` where `spread`
is the per-octave wavelength in blocks. Notable: `np_terrain_persist` *drives the persistence of
other noise fields per position*, and `np_floatland` uses **lacunarity 1.618 (the golden ratio)** to
break octave alignment and hide the harmonic look that lacunarity 2.0 produces.

Caves are gated by cost: `cave_width >= 10` disables generation entirely to "avoid the intensive 3D
noise calculations".

## FastNoiseLite specifics that matter here

- Noise types: `OpenSimplex2`, `OpenSimplex2S`, `Cellular`, `Perlin`, `ValueCubic`, `Value`. There
  is **no classic Simplex**. JS enum values are explicit and match the C++ declaration order.
- Fractals: `None`, `FBm`, `Ridged`, `PingPong`, plus two domain-warp-only variants.
- **`SetFrequency` is the reciprocal of feature size.** The default `0.01` means one noise cell
  spans ~100 input units, and is the single most common cause of "my terrain is flat".
- **`SetRotationType3D(ImproveXZPlanes)` is the key knob for voxel terrain** — sampling a heightmap
  with 3D noise at a fixed y otherwise produces visible axis-aligned grid artifacts.
- `_FractalBounding` is recomputed **only** by the octaves and gain setters, so those must be set
  before relying on the −1..1 output range. Changing lacunarity does not affect it.
- Cost, from their C++ benchmarks: **Value and Perlin are 1.3–1.7× faster than OpenSimplex2**, and
  **Cellular is 3–5× slower than Value**. Cellular must never be used for per-voxel density, only
  for coarse region/biome fields sampled far less often.
- The JS port (`fastnoise-lite`, 1.1.1) has **no batch/grid API** — there is no equivalent of
  Luanti's `Noise` class, which preallocates a per-chunk plane and fills a whole 2D slice in one
  call to amortise setup. Amortisation must be written here.
- The published tarball has **no `.d.ts` and no `FastNoiseLite.min.js`** despite jsDelivr listing
  both. `node_modules/fastnoise-lite/FastNoiseLite.js` is the real entry point.
- Method names are PascalCase (`SetNoiseType`, `GetNoise`), and `DomainWarp(coord)` mutates in
  place.

## Plan for this project

**A. Voxel access — done.** A direct-mapped slot array in front of the chunk `Map`, plus bitmask
local coordinates. Measured **121 → 23 ns/call (5x)**. The `Map` stays authoritative and `chunkKey`
stays a string, because tests and several modules write chunks into `world.chunks` directly with
string keys. Cache invalidation is wired into `reseed` and `switchDimension`. 11 tests in
`tests/worldChunkCache.test.js`.

**B. Meshing — done, twice.** First the chunk plus a one-block border is copied into a flat scratch
array once per mesh, so face and ambient-occlusion sampling is array indexing rather than roughly
fourteen world lookups per visible face: **44 → 26 ms/chunk**. Then the inner loop was made
allocation-free: the per-voxel neighbour object, the per-voxel `addFace` closure, the per-face corner
arrays, the `positions.map` on the water path and a `new Array(4).fill(...)` spread all went away,
replaced by static tables (`FACE_CORNERS`, `FACE_NORMAL`, `AO_OFFSETS`) and one reusable scratch
array. A CPU profile had put ~30% of sampled time in `meshChunk` and 14% in `addFace`, with 5.5% in
garbage collection.

Measured 25 chunks over 7 interleaved rounds in a single process: **196.4 → 87.5 ms, or 7.85 → 3.50 ms
per chunk (2.24x)**, with vertex counts unchanged. Parity is asserted exactly rather than by counts:
`tests/mesherPerformance.test.js` imports the previous mesher as a fixture and compares every
attribute and index of every geometry. 11 further tests in `tests/mesherParity.test.js` pin culling
and seam behaviour.

**C. Streaming — done.** `src/chunkStreamer.js`: nearest-first ordering, a generate ring one wider
than the mesh radius, meshing gated on all eight neighbours existing, and unloading beyond
`meshRadius + 3` with neighbour invalidation. It also removes a per-frame cost that scaled with the
whole loaded world: `refreshDirtyChunks` used to allocate and sort an array of every loaded chunk on
every frame. 17 tests in `tests/chunkStreaming.test.js`.

Two bugs found here, both of which made earlier "done" claims false:

- **Unloading never fired while walking.** The distance test ran against the MESHED set, whose members
  by definition all lie inside the mesh radius, so `distance > unloadRadius` could never be true. Over
  a 2400-frame walk crossing 82 chunks this left 1002 chunks resident with 41.4 MB of live geometry;
  after the fix, 143 chunks and **6.5 MB (6.4x less)**, with the bound no longer depending on how far
  the player travels. A single-jump test had passed by accident.
- **The budget bounded each phase, not the frame**, and was only consulted *after* an operation
  finished, so a frame that had already spent 5 ms could still begin a chunk costing 25 ms. 120 of
  901 mesh operations exceeded their supposed 8 ms budget, and the worst single chunk was 38.9 ms
  against a 16.7 ms frame.

Streaming now keeps a moving estimate of one generate and one mesh, and declines to *start* work that
would overrun a single shared per-frame budget (`frameBuildMs`, 10.5 ms), with the first operation of
a phase always allowed so progress cannot deadlock. Walking continuously, median / p99 / worst in ms:

| view radius | before | after |
|---|---|---|
| 4 | 8.15 / 45.5 / 75.9 | 3.86 / 17.4 / 26.4 |
| 8 | 8.70 / 32.0 / 48.6 | 7.57 / 23.7 / 34.8 |
| 12 | 11.10 / 35.9 / 79.5 | 11.95 / 25.5 / 49.4 |

**Remaining limitation of C.** It is still not a hard bound, for a reason a pre-check cannot fix:
generation and meshing are atomic per chunk, so the worst frame is `budget + longest single
operation`, and that tail is p99 16.5 ms / max 38.9 ms. A real bound needs time-slicing *inside* the
mesh loop, or a cheaper worst-case chunk.

**D. Scene graph — measured and rejected.** three.js walks every node of the scene every frame
regardless of whether it changed, and Voxelize treats this as significant, solving it with a
`StaticGroup` that skips a settled subtree. `scripts/bench-scene.mjs` reproduces that walk exactly and
measures **0.061–0.104 ms at 1089 chunk meshes** — about 0.6% of a 60fps frame. The technique does not
pay for itself here, so it was not added. The numbers are recorded so the conclusion can be rechecked
if the object count grows by an order of magnitude.

**E. Remaining, in the order I would do it.**

1. **Hard frame bounds.** Time-slice inside the mesh loop so one chunk can be finished across frames.
   This is the only thing between the current 24–49 ms worst frame and a real bound.
2. **Draw calls.** One mesh per chunk per material means hundreds of draw calls. Voxelize batches the
   opaque bucket into one `BatchedMesh` per 8x8-chunk region; Luanti reaches the same place by merging
   same-material buffers at draw time. Needs a GPU-side measurement first, since the CPU harness here
   cannot measure draw calls.
3. **Procedural generation.** Adopt FastNoiseLite (`OpenSimplex2` + `ImproveXZPlanes`, FBm 4–5
   octaves, `Value` for anything sampled often), restructure terrain as a 2D heightmap plus a 3D
   density term with a vertical gradient, sample 2D noise once per column rather than per voxel, and
   follow Luanti's pass order with its documented reasons. Biomes via heat x humidity.
   **Trees and structures currently cannot span chunk borders**, which is a correctness issue for
   both: a tree near a border is clipped and a structure crossing one is cut off.
4. **Raise the view distance.** Streaming and meshing now make radius 12 affordable — 716 chunks,
   38.7 MB, 12.0 ms average frame — where radius 4 was the original limit. This should follow (1) so a
   larger area does not come with larger spikes.
