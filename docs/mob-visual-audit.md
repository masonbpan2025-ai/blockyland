# Mob visual audit

A record of what every mob actually renders, taken from the **models and textures in this repo**, not from an
assumption that "the mob exists" means "the mob looks right". Two pilots are finished in this pass; the rest of
the roster is listed with its real state so the remaining work is visible rather than implied.

Reference plan: the visual-parity implementation plan this file belongs to.

## Why this pass exists

Two defects were reported from the Mob Inspector, and both had the same shape: the mob existed, had correct
health, dropped correct loot, and passed every behavioural test, while looking wrong.

| Reported | Cause |
| --- | --- |
| "snow golem doesn't have a face" | The carved pumpkin was a plain orange box with a dark rectangle stuck on the front. One material cannot put a picture on one face of a cube, and the real carved-pumpkin block was never used. |
| "husk looks the same as zombie" | The husk reused `zombie.png` and then wrote ONE colour over every material on the model. That flattens the skin, the clothing, the boots and any equipped item into a single hue. |

Neither was visible to a behavioural test. That is the lesson this file encodes.

## Assets

Real vanilla textures are fetched, not generated, by `scripts/mob-visual/fetch-assets.mjs` into
`public/assets/...`, mirroring the vanilla layout so a skin can replace a placeholder directly. Every byte is
locked by SHA-256 in `scripts/mob-visual/assets.lock.json`, with per-asset release provenance.

The wiki serves the same textures but answers scripted downloads with **HTTP 403**, so a mirror of the client
jar's assets is used. That is the only reason for the indirect source; the bytes are the originals.

More than one release is pinned, because these mobs did not all exist at once:

| Ref | Used for |
| --- | --- |
| `1.21.4` | everything current, including `bogged` (a 1.21 mob) |
| `1.20.4` | fallback for assets that predate the newer ref |

```bash
node scripts/mob-visual/fetch-assets.mjs          # download anything missing, then verify
node scripts/mob-visual/fetch-assets.mjs --verify # fail if anything is missing or changed
```

## Finished pilots

### Snow golem

**Before:** three white boxes, two thin sticks, and an orange cube for a head with a dark rectangle on the front.

**After:** the same silhouette, but the pumpkin is a real carved-pumpkin block — the grin on the front, plain
rind on the sides and back, the stem end on top — assembled from six materials with explicit atlas rectangles.
The golem's own head uses its entity skin, which carries the carved snow face, and the stick arms sample the
brown wood patch from the same sheet.

Key detail: a `16x16` block texture on a default `BoxGeometry` shows the same picture on all six sides. The
per-face rectangles are what put the face on `+Z` only.

| State | Status |
| --- | --- |
| Pumpkin equipped (default) | done — carved face on the front |
| Pumpkin sheared (head visible) | the head and its snow face are built; the shear transition is the existing behaviour code, not changed here |
| Head follows yaw/pitch | existing behaviour, unchanged |
| Throw pose | existing behaviour, unchanged |

### Husk

**Before:** a zombie with one flat sand colour over every material.

**After:** the husk's **own** vanilla skin, untinted. The recolour is skipped precisely when the real skin is in
use (`hasOriginalSkin`), because that recolour is what destroyed the clothing and any equipped item. When the
asset is absent — a bare checkout — the generated tint still applies, so the fallback is visibly a husk rather
than an untinted zombie, and the fallback path is covered by a test.

| State | Status |
| --- | --- |
| Adult | done — own skin, no whole-model tint |
| Baby | uses the shared baby scale behaviour, unchanged |
| Equipped item | no longer tinted, because the tint is skipped for the real skin |
| Zombie regression | covered by a test: the zombie is still untinted and unchanged |

## Roster state

Every other family below is **unaudited to source** in this pass. Each row names what the model currently does,
so the remaining work is enumerated rather than silently skipped. `tint` means the mob derives its skin from a
relative and writes one colour over the model, which has the same flattening defect the husk had.

| Family | Model today | Outstanding |
| --- | --- | --- |
| Zombie / skeleton variants | husk, stray, bogged now load own skins; drowned, parched still tint-derived | drowned overlay, bogged overlay + sheared state, parched own skin |
| Humanoids | villager and pillager have real skins; illagers, witch, iron golem partly flat colours | illager noses/arms, witch hat, iron golem vines and damage cracks, piglin equipment layers |
| Common animals | pig, cow, sheep, chicken have real skins | wool/sheared/dye layers, mooshroom mushrooms, horse markings and armour |
| Variant animals | mostly tinted relatives | cat/wolf coats and collars, fox/rabbit/frog/axolotl/parrot variants, panda faces, llama decor |
| Aquatic | generated textures | real fins/gills/tails/tentacles, pufferfish stages, tropical-fish patterns, guardian eye/spikes |
| Creepers / arachnids / small | creeper has a real skin | charged overlay, spider eyes and legs, silverfish/endermite segments, bat/bee wing poses |
| Nether | ghast, piglin, wither skeleton assets present | blaze rods, magma cube segments, hoglin tusks, strider cold state, brute clothing |
| End / hostile specials | enderman, shulker modelled | enderman eyes, shulker shell opening, phantom wings, warden tendrils, breeze/creaking structures, vex/allay wings |
| Large / boss | dragon and wither modelled | neck/tail/wing hierarchy, wither heads, emissive features, framing for large bounds |
| Newer implemented mobs | camel, sniffer, allay, armadillo, breeze and friends implemented | later-release asset references must be matched and acquired before their appearance is edited |

## Gaps recorded deliberately

- **No source model JSON was obtained.** The model definitions (`snow_golem.json` and peers) were not reachable
  from the pinned asset mirrors, which ship only textures. Geometry and UVs in this pass were therefore derived
  from the **texture atlas itself**, measured by decoding the PNG and sampling it, plus the published mob
  dimensions. Any family whose geometry needs to match vanilla cube-by-cube should acquire those model files
  first; guessing them from collision dimensions would be wrong.
- **The wiki's reference renders could not be downloaded** (HTTP 403), so no side-by-side pixel comparison
  against a wiki image is claimed anywhere. The evidence is rendered from the real assets in this repo.
- **Only two mobs are finished.** The roster above is not parity; it is an inventory.

## Evidence

`docs/mob-visual-evidence/` holds rendered captures. Each names the mob, the view, and what it demonstrates.
They were produced by rendering the real `MobManager` in a real browser — not from Node mocks, which cannot see
texture upload at all.

## What verifying against the live Inspector caught

The first pass was checked in a page that advanced the manager every frame, and both pilots looked right there.
The real `mob-debug.html` **spawns its mob and then sits paused**, so nothing per-frame runs at all. Anything that
finished a job "on the next update" therefore never finished it in the Inspector — the snow golem shipped as a
flat orange box while its own unit tests and a self-written harness both passed.

Three faults hid behind that one difference, and all three are now fixed and tested:

1. Deferred skin binding was driven from `manager.update`, which a paused session never calls.
2. `loadTexture` passed no `onLoad`, and supplying one *suppresses* three's default listener — so the texture's
   own `load` event never fired either, and both routes to completion were dead.
3. The readiness test asked whether an image object **existed** rather than whether it had decoded. Three's loader
   creates the `<img>` immediately, so that check was true from the start.

The lesson is in the plan and worth repeating: **a capture from a purpose-built harness is not an Inspector
check.** The Inspector's own spawn-and-pause behaviour is part of the fixture, and a page that ticks is a
different fixture. Every capture in this directory was taken from the real `mob-debug.html` endpoint.
## Second pass: what is finished, and what is not

Three mobs now use real vanilla skins on measured model geometry. Everything else below is unchanged and is NOT at
parity; the flat-colour problem is the single biggest cause and it affects about eighty spawners.

| Mob | State |
| --- | --- |
| Snow golem | Done. Real carved-pumpkin block head, its own entity skin, wood-textured arms. |
| Husk | Done. Its own skin, no whole-model tint. |
| Polar bear | Done. Real 128x64 skin, eyes and nose on the measured face patch, alpha cut-out. |
| Panda | PARTIAL. Face and eye patches are real, taken from the atlas patch at (10,10); the body and legs are still flat black and white. It cannot simply take its whole real skin because a brown panda is recoloured by writing flat colours onto two materials, and a textured material cannot take that. Finishing it needs a proper brown skin plus a dark/light split. |
| Mooshroom | NOT DONE. Still flat red boxes with five red cubes for mushrooms. It should use `red_mooshroom.png` (fetched and locked) on the cow's UV layout, plus mushroom-block geometry. |
| Shulker | NOT DONE. Still a box. Needs the shell texture fetched (`entity/shulker/shulker.png`, fetched and locked) and the opening/colour states. |
| Warden | NOT DONE. Has no face and no body detail. Its 128x128 skin is fetched and locked. |
| Everything else | Unaudited to source in this pass. Roughly eighty spawners still build plain boxes with flat colours, so they are structurally incapable of showing a face. |

### Two tooling lessons worth keeping

1. A MATERIAL WHOSE TEXTURE IS STILL LOADING RENDERS BLACK. Not its fallback colour. Holding a flat colour back
   until the bitmap exists is required, and the binding must not depend on the mob ticking, because the Inspector
   spawns paused.
2. VANILLA ATLASES HAVE TRANSPARENT PADDING INSIDE A PART'S OWN RECTANGLE. The polar bear's body face is only 81%
   opaque; an opaque material draws those texels as pure black, which put black bands across the animal. Alpha
   cut-out is required for entity skins.

`scripts/mob-visual/dump-rects.mjs` checks a proposed box's six faces against the real atlas and flags a face that
is fully transparent, which is the check that catches a black silhouette before it reaches the Inspector.
## Illagers and the witch

| Mob | State |
| --- | --- |
| Vindicator | Done. Real skin: face, grey coat, arms held crossed as in vanilla, plus the iron axe. |
| Evoker | Done. The same measured model with the evoker skin -- his robe and face come from the texture. |
| Witch | Done. Real skin including her hat, which was a separate cylinder before and is now part of the model. Her face and long nose come from the texture. |
| Vex | PARTIAL. It now wears its real 32x32 skin instead of being a translucent blue box, but its head still reads as a pale blocky shape rather than a clear face, because its atlas does not follow the standard quad layout and the face patch had to be located by hand. Its proportions also want a pass. |

The illagers share one model -- head 8x10x8 at (0,0), body 8x12x4 at (16,20), arms and legs 4x12x4 -- and differ
only by skin, so `illagerModel(texture)` builds all of them. The face is the 8x10 front face that layout produces
at (8,8), which `sample-rect.mjs` confirms carries the narrow eyes and the long nose. All three used to be flat
boxes with a light-grey cube for a head, so none of them had a face at all.

Still not done, in the same condition as before: the **mooshroom** (flat red boxes and five red cubes for
mushrooms) and the **shulker** (still a box), plus the roughly eighty spawners that still paint flat colours. The
**warden** also still has no face or body detail. Their textures are already fetched and locked.
## Mooshroom: real skin, wrong face

The mooshroom now wears its real vanilla hide instead of being a flat red box, and its five back mushrooms are real
mushroom-block geometry that changes with the variant. Red and brown are the two vanilla sheets, so the variant
swaps the skin rather than tinting the model -- which is what made the brown variant impossible to do properly
before, because one flat colour over a textured model stains the hide, the face and the mushrooms alike.

**Its face is still wrong.** The whole animal reads as a red mooshroom, but the head does not show a cow face: the
head samples the body's hide instead. The cause is established -- the cow's eyes are not at the offset its textbook
head layout reaches, so the face is copied from (2,8) to the layout's own origin and the head then samples that --
but the copy is not arriving before the head binds. `scripts/mob-visual/legacy-rects.mjs` prints what a
`createBoxWithUV` call actually samples face by face, which is the tool that identified it.

The **cow** has the same underlying problem and worse: its head now samples body hide too, so it reads as a brown
animal with grey patches. Both need the face patch resolved before either is finished.

Two behaviour tests changed shape with this, and were updated rather than deleted: `mooshroomParity.test.js` and
`spawnVariantOptions.test.js` asserted a material COLOUR difference between red and brown. The variant is a skin
swap now, so they assert which sheet each is bound to. `modelAppearance` was added alongside `modelColors` for
that reason: a variant can express itself by colour OR by skin, and a colour-only comparison reports two genuinely
different mobs as identical.

Still not done: the **shulker** (a box), the **warden** (no face or body detail), the **vex** (head still reads as a
pale block), and roughly fifty spawners that still paint flat colours. All their textures are fetched and locked.
## Shulker and warden

| Mob | State |
| --- | --- |
| Shulker | Done. It was a flat purple cube with a yellow box for a head. It is now a 1x1x1 shell from its real 64x64 skin, with a separate 1x0.5x1 lid hinged at its back edge so the opening animation has something to turn. The shell's ridged panels and the dark lip read correctly. |
| Warden | Mostly done. It has its real 128x128 sculk skin on the torso and head, its horns, the glowing chest core, and the glowing EYES, which the flat near-black box never had. The eyes are modelled rather than sampled, because the warden's atlas does not put its head on the textbook box layout and the glow could not be reached through it. |

### The warden's eyes, and what that says about the atlas layout

A cow's eyes are dark marks on light hide, so they can be found by looking for dark clusters. The warden's face is
almost entirely black sculk, so its eyes are the few texels that GLOW instead. `scripts/mob-visual/find-bright.mjs`
locates those by brightness and blue-green saturation, and it found them -- but at (56,8) and (60,40), which the
textbook 16x16x16 head layout cannot reach, because the warden's atlas does not use that layout.

So the eyes are modelled geometry. That is honest and it looks right, but it is a workaround, and the same
non-standard-layout problem is what leaves the **cow and mooshroom faces** unfinished. Resolving it properly means
obtaining the real model definitions rather than continuing to infer rectangles from pixels; the tools to measure
are now all in place, but the models themselves are the missing input.

Still not done: the **vex** (head reads as a pale block), the **cow and mooshroom faces**, and roughly fifty
spawners that still paint flat colours.