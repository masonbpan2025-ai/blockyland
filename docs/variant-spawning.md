# Variant-aware spawning

Two related defects meant that a mob's variant was often **stored but never rendered**, and could not
even be requested through the generic entry point.

## Bug 1: `spawnMob` silently dropped its fifth argument

```js
spawnMob(type, x, y, z) {            // four parameters
  switch (type) {
    case 'fox': return this.spawnFox(x, y, z, {});   // …and the switch forwarded only three
```

So `spawnMob('fox', x, y, z, { coat: 'snow' })` spawned a **red** fox. Every variant-aware spawner was
unreachable through the dispatcher — which is exactly how a spawn egg, the Inspector and the test
harness all spawn mobs.

This is the same class of defect as the missing `getMobDimensions` rows (five instances now): a shared
lookup that silently accepts a value and ignores it.

### The fix, and a mistake I made making it

The obvious transform — append `options` to all 69 cases — was **wrong twice**:

1. **A regex over-reached into nested arguments.** `spawnFox(x, y, z, {})` became
   `spawnFox(x, y, z, {}, options)`. Fourteen call sites broke this way.
2. **Some spawners take a positional default, not an options bag**:
   `spawnSlime(x, y, z, size = 4)`, `spawnCat(x, y, z, breed = null)`,
   `spawnVillager(x, y, z, profession = …)`, `spawnSiteManager(x, y, z, siteInfo = {})`. Appending
   `options` there would have set the slime size to an object.

The final version forwards `options` to **only the 26 handlers whose signature declares it**, verified
mechanically by cross-checking every forwarded call against its handler's parameter list. The other 37
cases are untouched.

## Bug 2: two mobs never applied their variant to the model

| Mob | Variant | Before |
| --- | --- | --- |
| **Panda** | brown | `PANDA_COLORS` held the palette, but nothing applied it — a brown panda rendered black and white |
| **Wolf** | collar colour | `collarMat` was hardcoded `0xdc2626`, so a lime collar rendered red at spawn, even though *dyeing* a collar afterwards worked |

`applyPandaColors` now applies the palette, and the wolf spawner resolves the collar colour through the
existing `SHEEP_COLOR_HEX` dye table.

Worth noting what is and is not a bug here: brown pandas **and only brown pandas** differ visually. The
other six personalities share the normal palette and differ only in behaviour, which is what the wiki
describes, so a test asserts that lazy, worried, playful, aggressive and weak all keep the normal
colours.

## A test of mine that was wrong

I first spawned all seven variant mobs into one pen and asserted they all survived 300 frames. The
rabbit died. That was not a bug: **`FOX_PREY` includes `rabbit`**, so the fox correctly hunted it. The
test now spawns them one at a time, and there are two extra cases recording the reason — one proving a
fox *does* kill a rabbit, and one proving a rabbit *alone* is unharmed. The failure was informative, and
worth keeping rather than deleting.

## Adaptations

- **Horses are not covered.** `spawnHorse(x, y, z)` has no options bag and its colour comes from the
  equine pack-sync path instead, so it was deliberately left alone rather than given a second, parallel
  mechanism.
- **Cats are not covered** for the same reason: `spawnCat(x, y, z, breed = null)` takes a positional
  breed, and the cat coat is applied through the taming path.
- **`slime` and `magma_cube` sizes** remain positional arguments. They are correct, and converting them
  to an options bag would be a wider change than this round warrants.
- Variants still are **not persisted across save/load** for every mob; that is the state-persistence
  path, which was addressed separately for mob state and is not re-verified here.

## Tests

`tests/spawnVariantOptions.test.js` (13 cases) covers the core claim — for each of seven mobs, two
option sets must produce **different rendered materials**, which fails if `options` is dropped *or* if
the colour is never applied, so it catches both bugs at once — the variant being recorded on the mob as
well as rendered, plain three-argument spawning still working for every case, the positional-default
handlers keeping `slimeSize = 4` and a numeric health, the panda palette per personality including the
five that must *not* change, the panda recolour being reversible and safe on malformed input, the wolf
collar default and an unknown colour falling back to red, fox/rabbit/parrot still reaching the model,
sheep and mooshroom colours, the options bag not leaking into mob state, a per-mob real-loop run, and
the fox-hunts-rabbit pair.

```bash
node --test --test-isolation=none tests/spawnVariantOptions.test.js
node scripts/test.mjs mob
```
