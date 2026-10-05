# Ambient locomotion: mobs that had no AI branch

## The gap

The shared mob update loop **does not apply `velocity`**. A mob moves only if its own update branch
sets a velocity *and* calls a mover. A mob with no branch falls through to `moveGroundMob` carrying
a zero velocity and stands in `state: 'idle'` forever: healthy, error-free and completely inert.

`docs/mob-update-smoke-coverage.md` measured this at **27 of the 60 advertised mobs**. This change
fixes **nine** of them, and is the first to fix any.

| Mob | Before | Now |
| --- | --- | --- |
| `mooshroom` | never walked | wanders |
| `polar_bear` | never walked | wanders |
| `panda` | never walked | wanders |
| `zoglin` | never moved | chases and strikes |
| `ravager` | never moved | chases and strikes |
| `vindicator` | never moved | chases and strikes |
| `evoker` | never moved | chases and strikes |
| `warden` | never moved | chases and strikes |
| `witch` | never moved | closes on the player (no melee; its threat is potions) |

Measured by the smoke suite: mobile mobs went from **33 of 60 to 45 of 60**.

## Why the mooshroom is the case that matters

`mooshroom` and `cow` are both 0.9 × 1.4 cattle with the same everything — and `cow` is matched by
the branch that calls `wanderMob` while `mooshroom` is not. So the cow walked and the mooshroom did
not, through all of its own parity work in an earlier round: correct health, hitbox, drops, breeding
food, shearing and stew behaviour, and a mob that had never taken a step. A test now asserts the two
walk alike.

## Design

Roles are **declared as data** in `src/ambientLocomotion.js` rather than hand-written per mob, and
the behaviour is the same three steps the proven zombie branch uses: pick a target, steer toward it,
strike in reach, otherwise wander. Adding a mob is one line. The module mutates only `yaw` and
`velocity`, so the existing mover and animator downstream need no changes.

`wanderMob` gained an optional injectable `random`, which is what makes the wander path testable.

## What is deliberately *not* in the table

- **`piglin` and `hoglin`.** They already have their own path-following steering with anti-jitter
  handling. Driving them from this table bypasses it and makes them shudder on the spot — which
  `tests/mobJitter.test.js` measures and which this change initially broke. A mob belongs in the
  table only when it has no steering of its own.
- **`witch` deals no melee damage** (`damage: 0`). It only closes on the player, because its threat
  is its potions. That is recorded in the table rather than left to look like an oversight, and the
  showcase's attack-AI test treats it as timing-dependent rather than asserting a coin flip.
- **`slime`, `magma_cube`, `phantom` and `shulker`** need a *hop* rather than a walk, which is a
  different mechanism; `shulker` is declared stationary at `speed: 0`.
- **`zombified_piglin`, `vex`** are intercepted by an early branch that moves them without ever
  setting a velocity, so the generic fallback is never reached. `zombified_piglin` is the clearest
  case: its branch calls `moveGroundMob` directly and returns.
- **The aquatic set** has no water in the adapted arena.

## Tests, and the two flakes this exposed

`tests/ambientLocomotion.test.js` (14 cases) covers the declared roles, that passive roles never
attack while hostile ones do, that the wiki's big numbers are right (warden 30, ravager 12), that no
role has a nonsense range/speed/reach, chase and wander through both the helper and the real loop,
the attack cooldown, the stationary role staying put, mobs outside the table being untouched, the
malformed-mob guard, the injectable random, every covered mob moving in the real loop, the
mooshroom-walks-like-the-cow case, and Inspector updates.

Two **pre-existing order-dependent flakes** surfaced because this change made mobs actually move:

1. `mobShowcase`'s attack-AI test asserted on mobs whose entry in `ATTACK_AI` is `special` and
   timer-driven. The witch was `observed` in one order and `unsupported` in another. Asserting on
   that is pinning a coin flip, so only deterministic mobs are asserted now, plus an invariant that
   holds regardless of timing: `unsupported` can never be reported for a mob whose scenario detail
   mentions a hit.
2. `mooshroomParity`'s breeding test relied on two mooshrooms already being within reach. They can
   now walk, and wandering carried them apart before they met. The pair is closed up once both are
   in love, so the test exercises the breeding rule rather than a chance encounter.

Both were real defects in the tests, not in the behaviour, and both had to be fixed for the suite to
be order-independent.

## Tests

```bash
node --test --test-isolation=none tests/ambientLocomotion.test.js
node --test --test-isolation=none tests/mobUpdateSmoke.test.js
node scripts/test.mjs mob
```
