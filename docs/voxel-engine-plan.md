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

Ordered by measured payoff against the baseline above.

**A. Voxel access — done.** A direct-mapped slot array in front of the chunk `Map`, plus bitmask
local coordinates. Measured **121 → 23 ns/call (5×)**. The `Map` stays authoritative and `chunkKey`
stays a string, because tests and several modules write chunks into `world.chunks` directly with
string keys. Cache invalidation is wired into `reseed` and `switchDimension`. 11 tests in
`tests/worldChunkCache.test.js`.

**B. Meshing — done.** The chunk plus a one-block border is copied into a flat scratch array once
per mesh, so face and ambient-occlusion sampling is array indexing rather than roughly fourteen
world lookups per visible face. Measured **44 → 26 ms/chunk**, with mesh vertex counts byte-identical
(opaque 44600, transparent 7580, water 18476, light 0 over the same 8 chunks). 11 tests in
`tests/mesherParity.test.js` pin the culling and seam behaviour rather than a golden buffer.

**C. Streaming — done.** `src/chunkStreamer.js`: time-budgeted generation and meshing (6ms / 8ms),
nearest-first ordering, a generate ring one wider than the mesh radius, meshing gated on all eight
neighbours existing, unloading beyond `meshRadius + 3` with neighbour invalidation, and an unload
radius deliberately wider than the mesh radius. This also removes a per-frame cost that scaled with
the whole loaded world: `refreshDirtyChunks` used to allocate and sort an array of every loaded
chunk on every frame. 16 tests in `tests/chunkStreaming.test.js`.

Smoke-tested with the real mesher: 180 frames of continuous walking at view radius 4 streamed and
meshed for an average of **10.1 ms/frame**, with 176 chunks resident.

**Known limitation of C.** The time budget is checked *after* a chunk finishes meshing, so the worst
frame is `budget + longest single chunk`. Measured worst single-frame mesh: **17.6 ms**, just over a
60fps budget. A strict bound needs meshing to be chunk-interruptible (time-sliced inside the mesh
loop) or per-chunk cost low enough that one chunk fits. Not yet done.

**D. Remaining, in the order I would do it.**

1. **Scene graph.** three.js walks every node of the scene every frame regardless of whether it
   changed. A loaded disc is hundreds of meshes at fixed positions, and Voxelize's `StaticGroup`
   (overriding `updateMatrixWorld` to skip a settled subtree) is a free, immediately measurable win.
2. **Draw calls.** One mesh per chunk per material means hundreds of draw calls. Voxelize batches
   the opaque bucket into one `BatchedMesh` per 8×8-chunk region; Luanti reaches the same place by
   merging same-material buffers at draw time. Needs a draw-call measurement in the harness first —
   the harness currently measures CPU work only.
3. **Frustum culling** for chunk meshes. three.js does per-mesh bounding-sphere culling, so this is
   partly free already, but an explicit chunk-level test avoids the per-mesh work.
4. **Procedural generation.** Adopt FastNoiseLite (`OpenSimplex2` + `ImproveXZPlanes`, FBm 4–5
   octaves, `Value` for anything sampled often), restructure terrain as a 2D heightmap plus a 3D
   density term with a vertical gradient, sample 2D noise once per column rather than per voxel,
   and follow Luanti's pass order with its documented reasons. Biomes via heat × humidity. Trees and
   structures currently cannot span chunk borders, which is a correctness issue for both.
5. **Scale.** Raise the view distance against measured budgets. Radius 4 costs 49 generated chunks;
   radius 16 costs 1089, so this must follow D1–D3 rather than lead them.

## Benchmark harness

`node scripts/bench-world.mjs` (add `--json` for machine-readable output) reports `getVoxel` ns/call,
terrain generation, per-chunk meshing, walking cost per view radius, and view-area footprint, and
prints mesh vertex counts so a change can be shown not to have altered geometry. It runs headless on
the real three.js via `scripts/bench-dom-shim.mjs` — stubbing three was attempted and abandoned
because Node resolves the real package anyway and the real library needs only a small DOM shim.

**It is only trustworthy on a quiet machine.** Back-to-back runs under load varied from 20 to 40 ms
per chunk, which is wider than most changes being measured. Take figures from repeated runs when
nothing else is competing for CPU, and prefer the minimum over the mean.
