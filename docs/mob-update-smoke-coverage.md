# Mob update smoke coverage

## Why this exists

The mob update loop wraps each mob in a `try`/`catch` so one broken mob cannot freeze the world.
The cost of that safety net is that faults are **quiet**: the mob is added to `brokenMobs`, skipped
for the rest of its life, and the only evidence is a single console line.

Six of the mobs added during this parity pass shipped exactly that way. Every one of them froze at
its spawn point while its own unit tests passed:

| Mob | Cause |
| --- | --- |
| rabbit | `RABBIT_PLAYER_AVOID_RANGE` used but not imported |
| bat | model exposed `wings` as an array; `moveFlyingMob` writes `wings.left.rotation` |
| fox | the hunt restarted the pounce every frame, so it crouched forever |
| bee | `isBeeFlower` used but not imported |
| spider | the hunt set `velocity` but nothing consumed it |
| cave spider | same locomotion gap |

Every one of those was caught by a hand-written "does it actually do something" assertion, and none
by a test of the pure helper the code was built around. This suite turns that hand-written
assertion into a standing one.

## What it asserts

`tests/mobUpdateSmoke.test.js` drives every mob in `DEBUG_MOBS` through the **real** `MobManager`
update loop under four world states (day, night, rain, thunder) with the player positioned so the
chase, anger, flee and sting paths are reachable, and then:

1. **No reported faults.** `manager.mobErrors` is the engine's own record of every swallowed
   exception, keyed by kind and message, so nothing is inferred — if any mob threw, its entry is
   already there. This single assertion is what would have caught all six bugs above.
2. **No mobile mob is frozen.** A mob that never moves over ten seconds is inert even when it is
   not throwing.
3. **No mob is left in `brokenMobs`**, which is the permanent form of the same failure.
4. **Every mob survives a save and reload** and then keeps updating cleanly, so a persisted state
   the update loop cannot digest fails here rather than only in a save-specific test.

## Placement is load-bearing, and I got it wrong twice

The movement assertion depends entirely on where the player stands, and both extremes are wrong:

- **Player on top of the mob**: several hostiles correctly stand still. The skeleton stops inside
  10 blocks in order to shoot; melee mobs stop in reach. This produced three false failures.
- **Player 40 blocks away**: most mobs idle, because their chase ranges are 16–32 blocks. This
  produced five more, and briefly looked like a systemic locomotion bug.

Twelve blocks is inside every chase range measured and outside every firing standoff, which is
where the assertion now sits.

## The pre-existing finding

Making the assertion honest surfaced something much larger than the mobs in this pass: **27 of the
60 advertised mobs never move at all.** The shared update loop does not apply `velocity` itself — a
mob moves only if its own update branch calls a mover. A mob with no branch falls through to
`moveGroundMob` carrying a zero velocity and stands in `state: 'idle'` forever. It is healthy,
error-free and completely inert.

The clearest reproduction is `mooshroom` versus `cow`: both are 0.9 × 1.4 cattle with the same
everything, but `cow` is matched by the branch that calls `wanderMob` and `mooshroom` is not, so the
cow walks and the mooshroom does not.

These are recorded explicitly in `knownFrozen` rather than excluded silently, so that:

- a **new** frozen mob still fails the suite, which is the protection the mobs in this pass need;
- the list cannot be padded to cover new breakage, because an entry that starts moving fails a
  second assertion and has to be deleted.

`blaze` is exempted from that second assertion because it belongs to work in flight on another
branch.

### The recorded list

- **Cube mobs** — `magma_cube`, `slime`, `phantom`: the hop is never driven, while the renderer
  reads a vertical velocity nobody sets.
- **No dispatcher branch at all** — `piglin`, `zombified_piglin`, `hoglin`, `zoglin`, `ravager`,
  `witch`, `vindicator`, `evoker`, `vex`, `shulker`, `guardian`, `elder_guardian`, `mooshroom`,
  `polar_bear`, `panda`, `warden`, `tournament_host`, `site_manager`.
- **Aquatic** — `drowned`, `squid`, `glow_squid`: the adapted arena has no water to swim in.
- **Boss-scale** — `ender_dragon`, `wither`: driven by their own event code rather than ambient
  locomotion.
- **In flight elsewhere** — `blaze`.

The `mooshroom` entry matters most for this pass, because mooshroom was one of the mobs brought to
parity earlier: its stats, drops, drops table, breeding and shear behaviour are all correct, but the
mob has never actually walked.

## Tests

```bash
node --test --test-isolation=none tests/mobUpdateSmoke.test.js
node scripts/test.mjs mob
```
