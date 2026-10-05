# Structure Inspector

Run `npm run dev`, then open <http://localhost:3000/structure-inspector.html>. The page also ships in
the production build (`npm run build` emits `dist/structure-inspector.html`).

It answers one question repeatedly and cheaply: **what does this structure actually do at this seed?**
It never imports the game entry point, creates a terrain chunk, generates a map or touches a save. The
whole page is a view over `src/structureInspectorSession.js`, which is a plain module the tests drive
directly.

## What it shows

- **The plan**: the structure id, the structure set that placed it, the seed, the origin chunk, the
  biome, the generation step, the terrain adaptation, the inflated start box and vanilla's placement
  reference point, the piece count, how many chunks the start touches, and a **plan hash**.
- **The pieces**: one row per piece with its id, type, box, rotation, depth and parent — click a row to
  highlight that piece's box in the scene.
- **The blocks**: realized into a sparse preview volume and drawn as coloured cubes with a legend that
  names every block and counts it. Clicking a cube reports the block's real name, coordinates and any
  block-entity data (a chest's loot table, for instance) — which is how content initialisation is
  checked without opening a chest in game.
- **Placement**: a `placementPreview` overlay drawing every structure-set candidate chunk in a
  ±128-chunk area, so the spacing/separation grid and the frequency gate are visible rather than
  inferred. The panel reports how many candidates the set has and how many are shown.
- **Determinism**: a button that plans the same chunk twice from a fresh engine and compares hashes.

## Why "Find nearest" is the default action

Most structures are sparse. At spacing 34 a chosen chunk is empty about 97% of the time, so a "plan
this chunk" default would make the inspector look broken rather than empty. *Find nearest* uses the
engine's `/locate` search and moves the camera to what it found.

## Limitations, stated rather than implied

- **Blocks are coloured cubes, not their atlas textures.** Enough to judge layout, and it keeps the page
  independent of the renderer. Block identity is never approximated: the legend, the click readout and
  the telemetry all use real names and ids.
- **Terrain is flat.** The preview surface is a single configurable Y, so a structure's terrain
  *adaptation* (beard, bury, encapsulate) cannot be judged here — that needs real terrain and is what
  the eventual golden-seed tests are for.
- **Only structures with a generator produce a plan.** The picker lists all 30 registry structures and
  marks the ones with no generator; selecting one logs why nothing was found instead of inventing a
  placeholder. `generatorCoverage()` in `src/worldgen/index.js` reports the same thing in code.
- **The preview volume is bounded** to Y 40..120. A structure outside that range is silently clipped by
  the writer, which is deliberate (a preview should not allocate for a mansion's full height) but does
  mean the block count is a lower bound for structures outside the window.
- No jigsaw connectors, processors or loot rolls are drawn yet, because none are implemented yet.

## Tests

```
node --test --test-isolation=none tests/structureEngine.test.js \
  tests/structureInspectorSession.test.js tests/structureInspectorPage.test.js
```

`tests/structureInspectorSession.test.js` drives the harness as the page does: it locates a plan,
realizes it, asserts the chest exists *with its loot table*, checks the seed setter refuses
non-integers rather than truncating them, and checks the determinism comparison.

`tests/structureInspectorPage.test.js` is the static guard: every element id the script looks up must
exist in the page, and the page must be a Vite build input. It exists because the main page and
`src/ui.js` once drifted apart and the symptom was an exception on first paint.
