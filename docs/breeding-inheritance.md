# Breeding trait inheritance

The shared breeding path builds a baby with `spawnMob(mob.type, …)`, which is a **plain copy of the
species with default traits**. Per-type variation was then patched in at the call site for exactly two
mobs:

```js
if(isEquine(mob))inheritHorse(baby,mob,other,this.mobManager);
…
if (mob.type === 'sheep') { baby.woolColor = inheritSheepColor(mob.woolColor, other.woolColor); … }
```

Everything else with a variant system produced babies that ignored their parents entirely: **pandas lost
their genes, rabbits, foxes and parrots lost their variant, wolves lost their collar colour, and goats
lost their horns.** None of this was visible to the smoke test, because all those babies still moved and
still had no errors — they were just wrong.

This replaces the ad-hoc patches with one dispatcher, `inheritBabyTraits(baby, parentA, parentB)`, so
each rule lives in the mob's own behaviour module rather than at the call site.

## What each branch now does

| Mob | Inherited | Reference |
| --- | --- | --- |
| **Panda** | **both genes**, then the personality is recomputed | one gene per parent, random order, 1/32 mutation, and the child's personality follows from the two genes |
| **Fox** | one parent's coat, via `inheritFoxCoat` | red × snow is a 50/50 |
| **Rabbit** | one parent's coat | one parent's type at random |
| **Parrot** | one parent's colour, with name and material updated | one parent's colour |
| **Wolf** | one parent's collar colour | a random collar colour from the parents |
| **Goat** | horns, plus the screaming trait | screaming is ~1/1000 at birth, and inherits ~50% from a screaming parent |
| **Mooshroom** | one parent's variant | brown or red |
| **Cow** etc. | nothing, returns `null` | no variant system to inherit |

The panda branch is the interesting one, because the cub's printed personality is **not copied from
either parent** — it falls out of the two inherited genes via the same dominant/recessive rule that the
spawn distribution uses. A cub from an `aggressive/normal` and a `lazy/brown` parent verifiably gets
both genes, and its personality is then whatever those genes imply.

## A behavioural bug fixed at the same time

**Pandas could not breed at all**, because `panda` was not in `BREEDING_FOODS`. Added as `['bamboo']`.

More importantly, Java pandas have a **placement requirement** the code had no concept of:

> "breed only if there is at least one bamboo plant (not including shoots) within a 7×7×3 area", and
> otherwise "briefly shake their heads and do not breed".

`checkBreedingPair` now refuses to pair two pandas with no bamboo around them, **before doing anything
else**, so two pandas full of bamboo in a stone room court forever and never produce a cub. Both halves
are tested: 400 courtship ticks with no bamboo produce no cub, and the same pair with one plant inside
the box does breed.

## A flaky test, reported rather than hidden

On the first grouped run, `mobUpdateSmoke`'s movement assertion failed; on an immediate re-run the same
166 tests passed 166/166, and the file passes in isolation. That is a **pre-existing flake**, not a
consequence of this change — the movement assertion is placement-sensitive and compares against a
500 ms-ish budget. I am recording it rather than quietly re-running until green, because a flaky
assertion in the harness that has caught four real defects this pass is worth knowing about.

## Adaptations

- **Cat coats**: the cat branch only accepts a coat that one of the parents actually has, which is what
  the wiki implies. The breedable-`cat` path is reached through wolf/cat taming rather than the ordinary
  food path, so this is wired but not exercised by a natural pairing in the arena.
- **Breeding cooldown is 300 s** in this codebase rather than the wiki's 5 minutes for adults, which is
  the same value, but the baby's 20-minute maturity is separate and already implemented.
- **The panda's "shake their heads" refusal animation** is not played; the refusal itself is enforced.
- **Horse and sheep inheritance stay where they were.** They already worked, and moving them would have
  risked a regression in two of the few inheritance paths that were correct.

## Tests

`tests/breedingInheritance.test.js` (11 cases) covers the panda food entry, panda gene inheritance with
the personality recomputed and each gene provably from a parent, two weak parents mostly producing weak
cubs with the correct 10 or 20 HP depending on the outcome, fox, rabbit, parrot and wolf inheritance each
sampled 200 times to prove **both** parents' traits appear (a real 50/50 rather than always the first
parent), a mob with no variant system correctly returning `null`, goat horns and the screaming-trait
inheritance sampled 400 times, the no-bamboo refusal and the with-bamboo success end to end through
`checkBreedingPair`, and malformed-input safety including a parent with no coat.

```bash
node --test --test-isolation=none tests/breedingInheritance.test.js
node scripts/test.mjs mob
```
