# Test-suite determinism: fixing the intermittent failures

## The problem

For three rounds I recorded the same note: *"one intermittent cross-file flake in `goatParity`"*. The failure
moved between files, so each round I re-ran the suite, saw the expected result, and moved on. That is exactly
the wrong response — **a suite that goes red at random makes every later verification untrustworthy**, because
the first question after any change is "what did I break", and a coin flip answers it.

So this round was spent finding and fixing it rather than adding a mob.

## What it was NOT

I had a confident hypothesis and it was **wrong**, which is worth recording:

> **Hypothesis:** cross-file state leakage. Some test seeds `Math.random` and does not restore it, so
> subsequent files see a constant.

I checked every test that assigns `Math.random` (five files), confirmed each restores in a `finally`, then
tested the hypothesis directly by running the suspect files **after** the stubbing files — 6 runs, all clean.

Then I tested the related idea that shared-process execution was the cause, by running all 72 mob files with
`--test-isolation=none` (my own manual invocation) and later `--isolated` (one process per file):

| Mode | Time | Result |
| --- | --- | --- |
| Explicit paths, shared process | — | **12/12 clean** |
| `--isolated` (one process per file) | 13.6 s | **still flaked** |
| `scripts/test.mjs mob` (shared process) | 12.3 s | flaked ~4 runs in 10 |

**Isolation did not fix it, and cost only 1.3 s** — so process separation was neither the cause nor a
plausible fix. That measurement is what redirected me to the tests themselves.

## What it actually was

Six assertions whose **outcome is a random draw**, with no seed:

| Test | Why it flaked |
| --- | --- |
| `snifferParity`: "really digs through the real update loop" | the dig can yield nothing in the 6000-frame window |
| `goatParity`: "snapping a horn removes it permanently" | ~1 adult in 10 **spawns missing a horn** (0.1 chance), so there was nothing to snap |
| `goatParity`: "a charge into a snapping block breaks a horn off" | same spawn roll |
| `goatParity`: "a charge into an ordinary block breaks nothing" | same spawn roll |
| `breedingInheritance`: "a panda cub inherits genes from both parents" | the same code rolls a **1/32 mutation per gene**, so ~6% of runs produce a gene from neither parent |
| `pandaParity`: "native type with the wiki health and hitboxes" | same panda spawn roll |
| `turtleParity`: "moves toward the water" | asserted `x > 0.5` on an observed **0.55** — 0.05 of margin |

The goat and panda cases are the interesting ones: the *assertion* was right, but the **fixture's premise was
random**. "A goat with two horns" and "a cub with no mutation" are both things the test needs to be true and
never established.

## The fix

A documented `withSeededRandom(seed, body)` helper — a plain LCG so a failure is reproducible from the number
alone — applied to the cases whose outcome is a random draw, plus one loosened threshold:

- The turtle threshold became **2 blocks** rather than 0.5. Two blocks still proves it moved toward the water,
  which is what the case is for; 0.05 of margin proved nothing about the behaviour.
- The seeding is **deliberately not applied broadly.** A seeded RNG makes a test deterministic but can also
  make it *vacuous* — if the only paths exercised are the ones seed 7 happens to take. It is used only where
  the assertion is "this random event occurred", never to paper over a threshold.
- I verified the chosen seeds produce the **intended** premise rather than merely passing: seed 1 yields a
  two-horned goat, and seeds 1–10 all produce a sniffer dig. I checked this explicitly because a seed that
  passes by taking the wrong branch would be worse than the flake.

## The other bug, which was mine

While adding the distance annotation to the "every mob moves" failure, I broke the test **twice**:

1. `entry.split(' ')[0]` — wrong, because mob names contain spaces (`polar bear`). The failure message then
   claimed known-frozen mobs had regressed.
2. My `PowerShell` replacement escaped `$` in `replace(/ \(moved .*\)$/, '')`, corrupting both a comment and
   the regex, and a follow-up line-surgery pass deleted an assertion and left a duplicated `recovered`.

The second is the recurring lesson of this pass: **`PowerShell` string replacement mangles `$`, and line-index
surgery on a live file is not a safe edit.** The repair that worked was reading the region and rewriting it
with the `edit` tool in one shot. The annotation itself was worth keeping, because now a failure reads
`polar bear (moved 0.020)` — naming the mob **and** how close it came.

## Verification

- **12 of 12 consecutive runs of the mob area** produced **exactly 7 failures**, all in the concurrent Blaze
  work. Before the fix, 4 runs in 10 had an extra non-Blaze failure.
- The full `mob world persist` set: **1657/1668 passing, 7 failing** — the known Blaze set — with no flakes.
- Per-file counts unchanged where seeding was added: sniffer, goat, panda, turtle and breeding suites all pass
  in full.

## Files changed

`tests/snifferParity.test.js`, `tests/goatParity.test.js`, `tests/pandaParity.test.js`,
`tests/breedingInheritance.test.js`, `tests/turtleParity.test.js`, `tests/mobUpdateSmoke.test.js`.

No production source was touched.

```bash
node scripts/test.mjs mob      # 12 consecutive runs, exactly 7 known failures every time
```
