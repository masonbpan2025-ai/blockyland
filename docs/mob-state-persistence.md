# Per-mob state persistence

The assessment's remaining high-priority shared gap: *"per-mob state is not persisted"*. A saved
map recorded only a mob's **type, position, yaw and health**, plus a handful of mob-specific
blobs for equines, zombified piglins, striders, squid and wither skeletons.

Everything else was lost on reload. Concretely, before this change:

| Saved as | Came back as |
| --- | --- |
| A baby calf with 12 minutes left | An **adult** |
| An age-locked baby (golden dandelion) | Growing normally |
| A sheared lime sheep | **Woolly and white** |
| A brown mooshroom | **Red** |
| A tamed, sitting, cyan-collared wolf in armour | **Wild, standing, red-collared** |
| A "Bessie" the cow | An unnamed cow |
| A "Toast" rabbit | A brown rabbit |
| A gold-coat rabbit / killer bunny | A random coat / ordinary rabbit |
| A large salmon | A re-rolled size |
| An enderman carrying grass | Empty-handed |
| A spider mid-retaliation | Calm |
| A 42-second-old endermite | A fresh one |

Every mob added or fixed during this pass was affected, which is why the assessment treats this
as capping what "parity" can mean for them.

## Design

`src/mobState.js` defines **one list** of persistable fields rather than adding a key per mob to
the save format:

- `PERSISTED_MOB_FIELDS` — scalars and plain arrays (age and growth, identity, sheep wool,
  mooshroom variant, salmon size, rabbit coat/type, wolf taming/collar/armour, sitting, timers
  such as anger, lifetime and moistness, roles).
- `PERSISTED_REFERENCES` — `owner`, stored as the marker `"player"` and resolved back to the
  live player object on load. A live object cannot be serialised; without this it would have been
  written as `[object Object]`.

Adding a mob's state is therefore a one-line change in one place, and a test asserts that every
field this pass introduced is on the list, so a future mob cannot silently forget to persist.

`serializeMobState` reads scalars, plain arrays and references only. Anything else — a mesh, a
velocity vector, a target — is **skipped rather than stringified**, so a save cannot silently
accumulate `[object Object]` entries.

## Two rules the restore has to honour

1. **A wolf's maximum health depends on taming.** Restoring `isTamed` and `health` in either
   order can leave a wolf above its own cap, so the restore re-derives the maximum (8 wild, 40
   tamed) and clamps current health to it. A wild wolf saved at 40 HP correctly reloads at 8; an
   injured tamed wolf keeps its injuries.
2. **Variants are derived from state, not stored in the mesh.** A restored sheep needs
   `sheepApplyWool`, a mooshroom needs its mushrooms re-shown (and hidden again for a baby), and
   a "Toast"-named rabbit needs its pattern re-applied. `mobAppearanceRestorers` maps mob type to
   that work as small callbacks, so the persistence module does not import every model module and
   create a cycle.

## Adaptations

- **`owner` only resolves to the current player.** A mob owned by somebody else records `null`
  rather than a dangling reference. This world is single-player, so that is the whole case.
- **`stewEffect` is persisted as a plain object** (a `{effect, seconds}` pair) rather than a
  status-effect instance, because that is how the mooshroom stores it.
- **Equine cargo, zombified links, squid and wither-skeleton state keep their existing dedicated
  serialisers.** This change is additive; it does not replace them, and the round-trip tests for
  those paths still pass.
- **Mobs are respawned rather than reconstructed**, as before, so a mob's transient AI state
  (current target, vehicle, wander goal) is deliberately not restored beyond what is listed.

## Tests

`tests/mobStatePersistence.test.js` (22 cases) covers the field list as a regression guard, the
serialiser's scalar-only and reference-only behaviour, the owner marker round trip, the wolf
health clamping in all three cases (wild over-cap, tamed full, tamed injured), and then drives
the **real `serializeWorld`/`deserializeWorld` pair** for: a baby's age and growth timer, an
age-locked baby, a sheared lime sheep with its wool layer actually hidden, a brown mooshroom, a
baby mooshroom staying mushroom-free, a tamed wolf with owner/collar/sitting/armour/max health, an
untamed wolf, a custom name, a gold-coat rabbit, a killer bunny (`RabbitType 99` and 8 armour), a
Toast rabbit, salmon size, dolphin moistness, an enderman's carried block, spider anger, endermite
lifetime, slime size, a mob with almost no state, and defensive handling of malformed state and a
throwing appearance restorer.

```bash
node --test --test-isolation=none tests/mobStatePersistence.test.js
node scripts/test.mjs persist
```

## Inspector

No model or behaviour change, so nothing new to inspect visually. The observable difference is
that saving and reloading a world now returns the same mobs rather than a normalised version of
them.
