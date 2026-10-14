# Tests

The suite is organised by **area**, matching the parts of the source tree, so a
change to one part only needs that part's tests.

```bash
npm run test:list        # show every area and the files it covers
npm run test:mob         # only the mob tests
npm run test:redstone    # only redstone, doors, rails and vehicles
npm run test:agent       # only the agent terminal
npm run test:all         # everything
npm test                 # equivalent to test:all
```

Several areas can be combined, and a filename substring can be matched:

```bash
node scripts/test.mjs mob redstone
node scripts/test.mjs --match riding
```

## Areas

| Area | Covers | Files |
|---|---|---|
| `agent` | terminal, vendors, plan parsing, world context | 9 |
| `mob` | mobs, skins, hit feedback, studio, breeding, debug | 17 |
| `redstone` | redstone, pistons, doors, rails, carts, boats | 8 |
| `studio` | Building Studio and its agent integration | 5 |
| `world` | terrain, biomes, nether, fluids, fire | 13 |
| `build` | inventory, chests, furnace, armour, enchanting | 9 |
| `combat` | arrows, skills, tournament, dungeon, farming | 5 |
| `render` | shaders, visual effects, overlays, dialogs | 4 |
| `persist` | save/load | 1 |

Every test file belongs to at least one area; `npm run test:list` is the source of
truth, and `scripts/test.mjs` fails loudly on an unknown area name.

## Why areas rather than one big run

`npm test` runs all 71 files **in a single process** (`--test-isolation=none`).
That is intentional — see isolation below — but state leaks between files, and a
mistake in one file can dominate the whole run. A test that misses its `fetch`
stub, for example, blocks on the production first-token timeout and turns a
millisecond test into minutes. Area runs keep that blast radius small.

## Isolation

`--test-isolation=none` runs every file in one process. It is the default because
Node's test runner spawns helper processes for per-file isolation, and some
sandboxes block that. Pass `--isolated` to opt into one process per file, which is
cleaner and avoids cross-file interference:

```bash
node scripts/test.mjs --isolated mob
```

## Writing a test for a new module

1. Name the file after the module: `src/foo.js` → `tests/foo.test.js`.
2. Add that name to the matching area in `scripts/test.mjs` (`AREAS`). If no area
   fits, add a new one rather than leaving the file unreachable.
3. Stub every external boundary — `fetch`, `document`, timers. A test must never
   reach the network or rely on a real clock.
4. Assert on observable behaviour (what moved, what changed) rather than internal
   flags, so refactoring does not break the test for the wrong reason.

## Shared-state hazards

Because all files share one process:

- **Never** assign `globalThis.document` (or other globals) without restoring it,
  or unrelated files break. Prefer injecting the dependency: `createCustomMobTexture(look, createCanvas)` takes a canvas factory precisely so tests need no global.
- Leave no live timers or pending promises; they leak into the next file.
- `tests/*.test.js` are the only files the runner picks up. Non-test helpers in
  `tests/` are ignored, so shared fixtures can live there safely.
