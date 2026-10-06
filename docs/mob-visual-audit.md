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
## Round three: what the official client JAR settled

A Minecraft 1.20.4 install is present on this machine, so the plan's preferred source is available:
`%APPDATA%\.minecraft\versions\1.20.4\1.20.4.jar`. Extracting from it verified that every texture this project
fetched is byte-identical to the official one -- the cow, mooshroom and their relatives are 100% texel-identical,
so no amount of re-fetching would change what the models sample.

`QuadrupedModel.createBodyMesh(int stanceWidth, CubeDeformation)` is the shared template behind the cow, pig, sheep
and their relatives, and it confirms the standard quadruped layout: **body 12x10x18 at (18,4), head 8x8x8 at
(0,0), legs 4x12x4 at (0,16), horns at (22,0)**. That is exactly what `spawnCow` and the mooshroom now use, so
their geometry and UVs are canonical rather than guessed. The cow therefore renders with a real face -- the muzzle
and the dark eye markings both come through -- and the earlier reading of it as "a brown animal with grey patches"
was a misread of a low-resolution capture, not a modelling error.

### Vex: simplified rather than finished, and said so

Five attempts to map the vex's 32x32 atlas onto a sensible model all produced a jumble of pale panels.
`fit-box.mjs` finds **no** 8x8x8 layout on that sheet whose six faces are all opaque, so the head's face cannot be
reached through a box layout at all, and the panels that do exist do not line up with a body/head/wing split. The
vex is now built simply and honestly: a small torso and head with visible dark eyes, thin arms and two real swept
wings, in flat colours **sampled from the vex skin**. It reads as the right mob and no longer as a pile of squares,
but the skin itself is NOT applied. That is recorded as a gap, not presented as parity.

The lesson to carry forward: pixel inference has now failed on the vex and on the warden's eyes, while the one case
where real model data was obtained -- the quadruped template -- resolved the cow immediately. **Acquiring model
definitions beats inferring rectangles**, and a decompiler or the OptiFine CEM documents are the next source to try
for the remaining ones.
## Round four: the local client JAR as a first-class source

`scripts/mob-visual/extract-from-jar.mjs` now reads the installed Minecraft client JAR directly, in Node, with no
external tools. That matters for two reasons:

1. It is the exact release's original bytes, so provenance does not depend on a third-party mirror.
2. Vanilla **nests several mobs one directory deeper than a flat mirror suggests**, and the mirror simply lacks
   them: the spider is `entity/spider/spider.png` (not `entity/spider.png`), the turtle is
   `entity/turtle/big_sea_turtle.png` (not `turtle.png`), and the llama coats are `entity/llama/creamy.png` rather
   than a `llama_cream.png`. Four textures failed to download for that reason alone.

Two client JARs are present (1.20.4 and 26.1.2). 1.20.4 is used for consistency with the assets already locked;
26.1.2 has reorganised its paths.

## Spider: real skin, real geometry

The spider was a flat dark box with a bespoke model that had **no UV mapping at all** -- every part was a plain
`BoxGeometry` with one colour -- so a skin could not simply be bound to it. It is now built from the vanilla
dimensions (head 8x8x8, thorax 6x6x6, abdomen 10x8x12, legs 16x2x2) with every part mapped to the real 64x32
skin, plus eight red eyes in two rows.

Two things this surfaced, both worth keeping:

* The abdomen is 10 wide but 12 deep, so **depth exceeds half the width** and vanilla's own layout has no room for
  its side faces. `createEntityBox` correctly rejects that; the abdomen uses explicit per-face rectangles, which is
  the documented escape hatch.
* The walk cycle turns `leg.hip.rotation.y` and `leg.knee.rotation.z` and reads `leg.baseYaw`, so each leg must be
  a **two-segment** limb. Rebuilding the legs as one piece silently broke the gait, and `spiderParity.test.js`
  caught it. The legs are two segments again.

The spider's eye count was also wrong in the tests: they pinned **four** eyes, and a spider has **eight**. Both
`spiderParity.test.js` and `caveSpiderParity.test.js` now assert eight.

Work list: **92 mob spawners, 41 with a real skin, 51 still flat-colour only.**
## Round five: bee, and a contract two mobs share

**Bee.** It was flat-coloured boxes with two loose stripe slabs balanced on the body -- the banding was separate
meshes rather than part of the texture, so it could never look right from the side or from above. The vanilla skin
already carries the banding: its front face at (17,9) is a patch with alternating dark bands and two eye marks. The
bee is now built from the vanilla dimensions (body 9x7x9, plus head, wings, six legs and a stinger) with every part
mapped to the real 64x64 skin.

**The wings contract is shared, and a test guards it.**
`moveFlyingMob` writes `mob.wings.left.rotation.z` and `mob.wings.right.rotation.z` to flap them, so `wings` must be
an OBJECT with named sides -- not an array. My first rebuild returned an array, which silently froze the model's
wings and broke three bee tests. `beeParity.test.js` pins the shape explicitly and even records why: "the bat
shipped a frozen model by getting this wrong". Worth knowing for every flying mob still to be done: the bat, the
phantom, the allay and the parrot all pass through the same function.

**Nested texture paths, resolved.** `extract-from-jar.mjs` now pulls the files a flat mirror lacks: the turtle is
`entity/turtle/big_sea_turtle.png`, the llama coats are `entity/llama/creamy.png`, the rabbit coats are
`entity/rabbit/brown.png`, and the ocelot is `entity/cat/ocelot.png`.

Work list: **92 mob spawners, 42 with a real skin, 50 still flat-colour only.**

### What the last two rounds establish as the repeatable pattern

1. Get the texture from the client JAR (`extract-from-jar.mjs`), not a mirror.
2. Measure the atlas (`atlas-extents.mjs`, `legacy-rects.mjs`, `sample-rect.mjs`) rather than assuming a layout.
3. Rebuild the geometry with `createEntityBox`, falling back to `createBoxFromFaces` when a box is deeper than half
   its width.
4. Check the parts the animation code reads -- `leg.hip`/`leg.knee`, `wings.left`/`wings.right` -- because a model
   that ignores them renders but does not move.
5. Verify in the real Inspector, then run the mob parity suites.
## Round six: allay, and two contracts that disagreed

**Allay.** It was five flat-coloured boxes -- a blue-white body, a head and two wing panels -- none of which sampled
the skin at all. It now samples its real 32x32 sheet (body 8x8x8, head, wings, trim, arms), so its pale blue-white
body and darker inner wing come from the texture.

**Two structural faults this surfaced, both worth recording:**

1. **A guard caught a bad box.** The wing is 2 wide but 7 deep, so depth exceeds half its width and vanilla's own
   layout has no room for its side faces. `createEntityBox` refused it with an explicit message rather than silently
   mapping a strip of neighbouring art -- which is exactly what that guard is for. Explicit per-face rectangles fix
   it.
2. **`poseAllay` and the tests disagreed about the shape of `wings`, and had for a while.** The pose function
   iterated `mob.wings` as an array of `{ pivot, side }` wrappers; `allayParity.test.js` and `moveFlyingMob` both
   address `mob.wings.left.rotation.z` directly. Whichever shape the model produced, one of the two broke -- my
   rebuild produced a third and the pose threw "object is not iterable". Both now use the shape the shared flight
   helper assumes: an object with `left`/`right`, each a Group with its own `rotation`, plus `length === 2`.

The general lesson, alongside the wings trap from round five: **before rebuilding a mob's model, read what the
animation and pose code reads.** A model can be geometrically correct and still be wrong.

Work list: **92 mob spawners, 43 with a real skin, 49 still flat-colour only.**
## Round seven: parrot, and the fourth appearance of one guard

**Parrot.** It was flat-coloured boxes -- body, head, two beak boxes, eyes, wings and tail -- none of which sampled
the skin. It now samples its real 32x32 sheet, with the measured layout head 4x4x4 at (0,0), body 6x8x6 at (2,8).

**A parrot variant IS its texture.** There are five vanilla sheets (red_blue, blue, green, yellow_blue, grey) and
the mob wears one. `applyParrotVariant` used to write flat colours onto the materials, which is incompatible with a
textured model: `adoptTexture` whitens a material once its map lands, so the two fought and whichever ran last won.
The variant now binds its sheet, and the colour table stays only as the fallback for a build with no assets. The two
tests that pinned the old contract were changed to assert the sheet.

**The same guard caught the same class of mistake twice more in one round.** `createEntityBox` refused the parrot's
wing (1 wide by 6 deep) and then its tail (2 wide by 8 deep), because depth exceeded half the width and vanilla's
own layout has no room for the side faces. That is now the FOURTH and FIFTH time this guard has caught it -- after
the polar bear head, the spider abdomen and the allay wing. It is easily the most valuable thing in
`entityBox.js`: the failure it prevents is silent, mapping a strip of whatever art happens to sit next to the part.

Work list: **92 mob spawners, 44 with a real skin, 48 still flat-colour only.**
## Round eight: goat, and a correction to the batch premise

**Goat.** Unlike the spider and allay it did NOT need rebuilding: it already had the right shape -- body, head, long
muzzle, beard, swept horns, tail, four legs. What it lacked was any UV mapping, so every part was a plain
`BoxGeometry` in one flat colour and the skin could not be applied. `quadRects` (exported from `entityBox.js`) gives
the six rectangles of vanilla's layout in three's face order, so those boxes were re-mapped **in place** rather than
rebuilt. The head block is 12x10x16 at (0,0), the body 12x10x16 at (38,0), the legs at (0,17); the mapped rects
measure 84-99% opaque art, so the rectangles are right.

That in-place technique is worth remembering: `quadRects` is the cheap path for a mob whose silhouette is already
correct, and rebuilding is only needed when the parts themselves are wrong.

**A correction to my own batch premise.** I wrote `check-quadruped.mjs` to classify every atlas against the standard
quadruped layout (body 12x10x18 at (18,4)). It reported "no" for the cow -- a mob that demonstrably works -- and the
reason is that **the premise was wrong**: that layout needs 36 wide by 28 tall, which does not fit a 64x32 sheet at
all. The working quadrupeds use the legacy `createBoxWithUV` with explicit pixel dimensions per part. The tool is
kept because measuring is still better than guessing, but its verdict column should not be trusted for a 64x32 sheet,
and that is now recorded here rather than left as a misleading green tick.

**Honest evidence note.** The goat capture shows texture colour rather than a flat fill, and its UV rectangles are
verified against the atlas, but at the Inspector's framing I cannot confirm the face reads as a goat's face the way
I could for the warden or the spider. Treat the goat's facial detail as LIKELY rather than verified.

Work list: **92 mob spawners, 45 with a real skin, 47 still flat-colour only.**
## Round nine: fox, and the helper gets promoted

**The in-place helper is now shared.** The goat was the first mob to need "re-map an existing box" rather than
"rebuild the model", so it grew a private helper. With three more mobs wanting the same thing, that arithmetic moved
into `entityBox.js` as `applyQuadUvs`, and the goat now calls it. One implementation instead of five copies is the
difference between a technique and five chances to mistype a rectangle.

**Fox.** It already had the right silhouette, so it took the cheap path: `applyQuadUvs` dressed its existing body,
belly, head, muzzle and tail. Blocks were chosen with `fit-box.mjs`, which scores every candidate layout by its
WORST face plus how much real detail the block carries -- so a pale, mostly-transparent corner cannot win on area
alone. Head 8x8x8 at (16,10), body 6x6x12 at (0,1).

**Two fox coats, so the coat is a texture.** Red and snow are separate vanilla sheets; the mob now binds the one its
coat names, with the colour table left as the no-assets fallback. In 1.20.4 the snow sheet is `fox/snow_fox.png`
while 26.1.2 renamed it `fox/fox_snow.png`; the newer name is used, so the path is version-sensitive and that is
recorded in the manifest comment.

**Honest evidence note.** The fox capture shows a properly furred orange body, black ears and a pale muzzle, and the
head's front face samples the fox sheet's muzzle/mouth region -- which is what that block actually contains, not a
mapping fault. It reads as a fox. I would still call the face LESS convincing than the warden's or the spider's, and
I have not proven the exact rectangle vanilla uses without the model source.

Work list: **92 mob spawners, 46 with a real skin, 46 still flat-colour only.**
## Round ten: rabbit, llama, turtle, and a text-anchor trap that bit twice

**Three more mobs dressed with `applyQuadUvs`:** the rabbit (body/head/legs), the llama (body, tall neck, head) and
the turtle (shell, rim, neck, head).

**A TEXT ANCHOR BIT TWICE IN ONE ROUND, and both were my own edits.**

`const bodyMat = new THREE.MeshLambertMaterial({ color: colors.base });` is a line the FOX, the RABBIT and the LLAMA
spawners all write verbatim. A plain string replace therefore hit all three: the rabbit began loading
`FOX_SKIN_PATHS`, and the llama's binding landed inside the fox, referencing a `variant` the fox does not define.
Both were caught, but only because a binding audit (printing every `adoptTexture` call with the spawner it sits in)
made them visible. **Splice by line number inside the named function, or anchor on something unique.** After the
audit, every one of the twelve skin bindings sits in the right spawner.

**A second, quieter trap: CRLF.** `applyLlamaCoat` refused a literal multi-line anchor because `llamaBehavior.js`
uses CRLF line endings. That has now cost time three times in this project, so the fix is always a regex.

**Two genuine bugs the tests caught.** `applyLlamaCoat` and `applyRabbitCoat` only wrote `bodyMat.color`, which a
bound texture overwrites with white -- so a llama's coat change and naming a rabbit "Toast" changed **a colour nobody
could see**. Both now bind their own sheet through `adoptWhenReady`, with the colour kept as the no-assets fallback.
The rabbit sheets also had to be renamed to match their declared paths (`rabbit_white.png` -> `white.png`), because a
path that 404s renders BLACK rather than falling back.

**Honest evidence note.** The turtle capture shows shell structure and a UV-mapped shell, but it reads green rather
than the sea-turtle's olive/brown tones, so the shell's rectangle probably wants re-fitting against the 128x64 sheet.
Recorded as NOT finished rather than presented as done.

Work list: **92 mob spawners, 49 with a real skin, 43 still flat-colour only.**
## Round eleven: the turtle shell, and a failure mode worth naming

**The turtle's shell was mapped to an empty rectangle.** I had declared it 16x4x18 at (64,0) on the 128x64 sheet, and
that rectangle measures **0% opaque** -- entirely empty sheet. Transparent samples are culled by `alphaTest`, so the
shell was rendering in its **FALLBACK COLOUR**, and the green in the previous round's capture was never a texture at
all. `fit-box.mjs` finds the real block at **(11,30)**, 16x4x18 with 25% detail, which is the most detailed flat box
on the sheet; its faces now measure 67-100% opaque with 105 dark texels on the top face.

**THE FAILURE MODE, NAMED.** A texture that is never bound, a bitmap that is missing, and a rectangle that is empty
sheet ALL look the same: the mob renders, in its fallback colour, and looks plausible. "The mob renders" was never
the same claim as "the texture is bound", and I had been treating a screenshot showing colour as evidence of a
texture. Two of those three causes have already bitten this project (a missing bitmap renders BLACK; an empty
rectangle renders the fallback), which is why `tests/mobUvCoverage.test.js` now measures the opacity of the turtle's
declared shell rectangle and pins the fact that the OLD block is empty -- so a tidy-up cannot reintroduce it.

**The general check to run on the rest of the roster:** for every mob whose parts are mapped, measure the opacity of
each declared rectangle. Any part sitting at ~0% is silently untextured. The tooling for this now exists
(`fit-box.mjs`, `quadRects`, and the new test's helpers); it has not yet been run across all forty-nine.

Work list: **92 mob spawners, 50 with a real skin, 42 still flat-colour only.**
## Round twelve: I built the sweep, and it lied to me once

**The sweep exists: `scripts/mob-visual/audit-uv-coverage.mjs`.** It walks the source for UV call sites, resolves the
asset each one belongs to, and reports the opacity of the rectangles vanilla's layout derives from the arguments. A
part near 0% is sampling empty sheet.

**Getting its ATTRIBUTION right took three attempts**, and the wrong versions were worse than useless because they
were confident:
* a per-file ambient texture attributed all ninety rows in `mobs.js` to `husk.png` -- a report that cannot tell a cow
  from a husk;
* switching to explicit-only produced **zero** rows, because the behaviour modules call `applyQuadUvs` without ever
  naming the skin constant (it lives in `mobs.js`);
* the working version attributes per ENCLOSING FUNCTION for `mobs.js`, and per file for the single-mob behaviour
  modules.

**THEN IT LIED.** It flagged the warden's arm and torso as broken, the arithmetic was persuasive, and I halved the
warden's `texW` on that evidence. **Rendering proved the change made the warden visibly WORSE** -- its parts sampled
bright non-sculk texture -- so it is reverted and `src/mobs.js` is byte-identical to the previous commit. The warden
was already correct; the flag was this tool's false positive, because the legacy `createBoxWithUV` helper's scaling is
not what my model assumes.

The script now opens by saying exactly that: **treat a flag as a QUESTION to verify in the Inspector, never as a
defect.** I would rather ship a labelled tool than a confidently wrong one, and I would rather write down that I nearly
"fixed" a correct mob than quietly drop it.

**What the sweep DID earn:** it is what found the turtle shell fault, and the reasoning behind it is what made the
turtle's empty rectangle visible as a category rather than a one-off.

Work list: **92 mob spawners, 50 with a real skin, 42 still flat-colour only.**
## Round thirteen: the ocelot was falling back to a canvas with no bitmap

**A real bug, found by following the delegation.** `spawnOcelot` delegates to `spawnCat(x, y, z, 'ocelot')`, and the cat
spawner looked up `this.textures['cat_ocelot']`. There is no such key -- the preloaded table stores the ocelot as
`ocelot` -- so the lookup MISSED and fell through to `createCatTexture('ocelot')`.

`createCatTexture` returns a 64x32 **canvas** texture, and in a paused Inspector a canvas whose bitmap has not
uploaded is a material with a map and no image, which renders BLACK. That is the third member of the same family as
the husk's missing bitmap and the turtle's empty rectangle: **a texture that cannot be sampled silently becomes a
flat colour, or black, and looks like a design choice.**

Two fixes:
* the lookup now tries `cat_<breed>`, then the bare `<breed>`, then the procedural canvas;
* the ocelot preloads the **real vanilla sheet** (`entity/cat/ocelot.png`, extracted from the client JAR) instead of a
  canvas, with the procedural texture kept as the loader's fallback. The cat BREEDS keep their procedural textures --
  those are this project's own invention rather than vanilla assets, and replacing them is a separate question.

The ocelot now renders in the real ochre/tan ocelot palette with its green eyes and white face patches, matching the
sheet rather than a generated approximation.

**Also worth recording: a false alarm I chased down properly.** The mob area reported 8 failures against a baseline of
7. Stashing only `src/mobs.js` restored 7, which looked like my fault. It was not: the extra line came from
`tests/mobUpdateIsolation.test.js`, which passes 10/10 in isolation BOTH with and without my change, and two further
full runs both reported exactly 7. So it is cross-test flakiness in the shared-process runner, not a regression -- but
I only know that because I checked instead of assuming either way.

Work list: **92 mob spawners, 51 with a real skin, 41 still flat-colour only.**
## Round fourteen: the wolf, and a lesson I over-generalised

I generalised from the ocelot: "a procedural canvas whose bitmap may not upload renders black, so every
`createXTexture` is suspect". So I swapped the wolf's `createWolfTexture()` for the real vanilla sheet.

**IT MADE THE WOLF VISIBLY WORSE, AND I REVERTED IT.** `createWolfTexture` authors a texture to MATCH this model's
default box UVs, so the wolf rendered as a clean grey animal with dark eyes, nose and ears. The vanilla sheet is laid
out for VANILLA's model, and this model has no UV mapping -- so binding it stretched the sheet across every face and
the wolf became a patchwork of light, dark and a stray magenta patch.

**The ocelot lesson was narrower than I took it to be.** The fault there was a LOOKUP MISS that silently discarded an
already-correct texture. It was NOT "canvas bad, sheet good". A procedurally authored texture is a legitimate design
choice, and swapping in a real sheet only helps once the geometry samples it correctly.

**That is twice now** -- the warden last round, the wolf this round -- where reasoning from an audit produced a change
that rendering proved worse. Both were caught by rendering. The rule I keep re-learning: an audit output is a
QUESTION, and the Inspector screenshot is the ANSWER.

`src/mobs.js` carries no change from this round, which is the right outcome. The wolf still needs real geometry with
real UVs before its vanilla sheet can be used, and that is a deliberate piece of work rather than a one-line swap.

Work list: **92 mob spawners, 51 with a real skin, 41 still flat-colour only.**

## Round fifteen: the wolf, geometry-first, and still wrong

I did what last round's lesson prescribed: **geometry first, then the skin.** I derived the wolf's blocks from the
sheet's seams using vanilla's own layout formula (for a box `tw, th, td` the sprite width is `2*td + 2*tw`):

* head **6x8x6** at (4,4) -- faces measured 31-100% opaque;
* body **12x6x6** at (21,4) -- faces 25-96%;
* legs **4x12x4** at (11,15) -- faces 38-75%.

Every one was checked with `legacy-rects.mjs` and carried art on every face. I mapped the body and head with
`createBoxWithUV`, then bound the sheet.

**IT IS STILL A PATCHWORK** -- tan, olive and a magenta patch instead of a grey wolf. The derivation is wrong
somewhere pixel extents cannot show me, and the likeliest explanation is the same one I reached about the vex's
atlas: **the wolf's sheet does not follow the textbook `2*td + 2*tw` seam layout my formula assumes.**

**Pixel inference has now failed on this mob three times**, and on the vex before it. It succeeded exactly once -- the
cow -- and that was because `QuadrupedModel.createBodyMesh(stanceWidth, Dilation)` gave me the real template.

The wolf is reverted to its authored canvas texture, which renders a clean grey animal with dark eyes, nose and ears.
That is better than anything I have derived, and `src/mobs.js` again ends the round with no change.

**The conclusion I should have drawn two rounds ago: stop deriving, get the model definition.** The pattern across
this goal is now unambiguous. Every mob that came out right -- cow, mooshroom, pig, sheep, spider, bee, allay, parrot,
goat, fox, rabbit, llama, turtle, ocelot -- was solved by having a real layout or a real sheet laid out for a model
that already matched. Every mob I have tried to reverse-engineer from pixels alone -- vex, warden's eyes, wolf -- has
resisted.

The next round should be spent making the wolf's shulker-style rebuild possible from source rather than guessing:
options are a JVM to run the downloaded decompiler, or an authoritative published model definition. Until then the
wolf stays as it is, and I am not going to keep spending rounds on it.

Work list: **92 mob spawners, 51 with a real skin, 41 still flat-colour only.**

## Round sixteen: trying to get real model data, and being honest about where it stands

**The plan was right; the execution is not finished.** Last round I concluded "stop deriving, get the model
definition". This round I went after it and did not get there.

**What I checked first:** there is **no `java.exe` anywhere on this system** (searched Program Files, Program Files
(x86), LOCALAPPDATA, APPDATA and the user profile to depth 5). `winget` IS available, so
`winget install EclipseAdoptium.Temurin.21.JRE` plus the Vineflower jar already downloaded at
`%TEMP%\decompiler\vineflower.jar` is the obvious route. I did not take it this round and should have.

**What I built instead:** `scripts/mob-visual/read-model-classes.mjs`, a class-file reader meant to pull
`ModelPartBuilder.uv(u, v)` arguments out of the compiled models without a JVM. Its **ZIP layer is verified** -- it
lists and inflates all 23,109 entries of the Fabric intermediary jar -- and it confirmed the model classes are present
under intermediary names. Its **class reader does not work**: it reports a constant pool of 51,712 entries against a
real count far smaller and finds zero invoked method names, so it never reaches a `Code` attribute and always reports
nothing. It is committed as WORK IN PROGRESS with that failure written into its own header, and it now prints its
limitation rather than an empty success.

**One useful thing it established:** entity models are named by INTERMEDIARY id (`class_602`), so `--grep wolf` can
never match. That is worth knowing before anyone else tries the same search.

**A bounded attempt at a mob, which also failed.** None of the 26 flat-colour spawners has a sheet on disk, so none
takes the easy path. I extracted the frog's sheet (`entity/frog/temperate_frog.png`, 48x48) and checked it against the
standard quadruped head block: 52/48/13% opaque across its faces, and **zero fully-opaque 8x8 cells on the whole
sheet**. The frog is not a quadruped and its sheet does not follow that layout. I stopped rather than guess, because
guessing is now 0-for-4.

**Where that leaves the goal, stated plainly.** The remaining 41 mobs need real model data. Pixel inference has
failed on the vex, the warden's eyes and the wolf, and this round it also failed on the frog. The successful mobs all
had a real layout or a panel model. **The next round should install a JVM and run the decompiler** rather than write
more analysis tooling, because that is the only approach on this project with a demonstrated success.

Work list: **92 mob spawners, 51 with a real skin, 41 still flat-colour only.**

## Round seventeen: installed a JVM, decompiled the real models, and the wolf finally works

**The approach I said I would take, and it paid off immediately.** Last round I concluded "stop deriving, get the model
definition". This round: no `java.exe` on the machine and `winget install` needs elevation (exit 1602, and approvals
are off), so instead I downloaded a **portable Temurin 21 JRE** (49 MB zip), extracted it, and ran **Vineflower** --
already downloaded two rounds earlier and unused until now -- against the Fabric intermediary jar.

**Decompiling gave exact numbers, and they were different from every guess:**

| part | real (u,v) | real size | what pixel inference produced |
| --- | --- | --- | --- |
| head | (0,0) | 6x6x4 | 6x8x6 |
| snout | (0,10) | 3x3x4 | -- |
| ear | (16,14) | 2x2x1 | -- |
| body | (18,14) | 6x9x6 | 12x6x6 |
| upper body | (21,0) | 8x6x7 | -- |
| leg | (0,18) | 2x8x2 | 4x12x4 |
| tail | (9,18) | 2x8x2 | -- |

Texture 64x32, confirmed by `method_32110($$0, 64, 32)`. **Three rounds of pixel archaeology produced a model that
was wrong in almost every dimension**; one decompile produced the right one.

**The wolf is rebuilt from `WOLF_MODEL`**, holding the decompiled rectangles as data with their provenance, including
vanilla's two-segment tail (`tail` plus a `real_tail` child) and its nested `real_head` structure. Its authored canvas
texture is replaced by the real vanilla sheet, because now the geometry actually samples it.

**Also decompiled and available, in `%TEMP%\decompiled`, for the next rounds:** `class_617` (vex), `class_7198`
(frog, sheet 48x48), `class_7280` (warden), `class_560` (cow). The vex in particular has been unresolved since round
three and its real model is now sitting on disk.

**Three placement faults the render caught, all mine:** the parts sat at vanilla's y≈14 units so the model floated out
of frame; the splice had also dropped `group.position.set`, the shadow traverse and `this.scene.add(group)`, so the
model was built but never added; and the collar needed `visible = false` until taming. A build can be perfectly
correct and render as literally nothing.

**The `.tiny` mappings are the interpreter for the output.** `mappings/mappings.tiny` from `yarn-1.20.4+build.3` maps
intermediary ids to readable names (`class_624` -> `WolfEntityModel`), which is how the decompiled files are
identified. That is worth keeping in the toolchain notes.

Work list: **92 mob spawners, 52 with a real skin, 40 still flat-colour only.**

## Round eighteen: the vex, resolved after fifteen rounds

**The vex has been the oldest open item in this goal** -- unresolved since round three, through five failed attempts
at inferring a layout from its 32x32 sheet. Round seventeen's decompiler settled it in one read.

**Why every inference failed, from the decompiled `VexEntityModel` (`class_617`):**

| part | (u,v) | size | note |
| --- | --- | --- | --- |
| head | (0,0) | 5x5x5 | at local (0,20,0) inside a root at (0,-2.5,0) |
| body | (0,10) | 3x4x2 | layer 0 |
| body robe | (0,16) | 3x5x2 | layer 1, dilation -0.2 |
| right arm | (23,0) | 2x4x2 | dilation -0.1 |
| left arm | (23,6) | 2x4x2 | dilation -0.1 |
| left wing | (16,14) | **0x5x8** | ZERO WIDTH, mirrored |
| right wing | (16,14) | **0x5x8** | ZERO WIDTH |

**THE WINGS HAVE ZERO WIDTH.** Vanilla models them as flat planes -- `.method_32096()` sets the width to 0 -- and the
left wing reuses the RIGHT wing's 5x8 patch with a mirror. So `fit-box.mjs` could never find a box that matched,
because **there is no box**: I spent five rounds searching for a three-dimensional part that does not exist. The
texture is 32x32 (`method_32110($$0, 32, 32)`).

**`buildModel` now supports flat parts.** A part can declare `plane: [depth, height]` and a single `uv` patch, which
also gives the illager family a way to express ear and cape plates later. The vex is rebuilt as a nested tree --
root, head, body with its robe layer, two arms, two mirrored wings -- and samples its real skin rather than flat
colours sampled from it.

**Two faults the render caught, both mine, both "correct build, invisible output":**

1. I marked the zero-size `root` part `visible: false`. Three propagates a hidden parent to EVERY child, so that hid
   the whole mob.
2. I wrote the wing plane as `[5, 8]` reading it as (width, height) when the box is `0 x 5 x 8` -- zero WIDTH, 5 tall,
   8 DEEP. Swapping them built 5-deep, 8-tall stubs instead of wings sweeping back from the shoulders.

That is the **third** time this project has produced a model that was geometrically right and rendered as nothing or
as the wrong thing, and the third time only the screenshot caught it.

Work list: **92 mob spawners, 53 with a real skin, 39 still flat-colour only.**

## Round nineteen: the frog's geometry is real, its texture is not bound yet

**Rebuilt from the decompiled `FrogEntityModel` (`class_7198`).** Last round I checked the frog's 48x48 sheet against
the standard quadruped head block, got 52/48/13% opacity, and stopped rather than guess. The decompiled source shows
why that was hopeless:

| part | (u,v) | size | note |
| --- | --- | --- | --- |
| body | (3,1) | 7x3x9 | |
| body layer | (23,22) | 7x0x9 | FLAT |
| head | (0,13) | 7x3x9 | |
| right / left eye | (0,0) / (0,5) | 3x2x3 | |
| croaking body | (26,5) | 7x2x3 | dilation -0.1 |
| tongue | (17,13) | 4x0x7 | FLAT |
| arms | (0,32) / (0,38) | 2x3x3 | |
| hands | (18,40) / (2,40) | 8x0x8 | FLAT |
| legs | (14,25) / (0,25) | 3x3x4 | |
| feet | (2,32) / (18,32) | 8x0x8 | FLAT |

Texture 48x48. **The tongue and all four hands and feet have a dimension of 0** -- flat planes again, like the vex's
wings. This is now the second mob whose model is only expressible with `plane` parts, which supports having added
that to the builder last round.

**`buildModel` now falls back to explicit faces automatically.** `createEntityBox` refuses a box deeper than half its
width, and the frog's 7x3x9 body is exactly that shape -- as are the wolf's 3x3x4 snout and the turtle's 10x8x12
abdomen. Rather than have every real mob fail on a layout that cannot express it, the builder catches the refusal and
uses vanilla's own rectangles (`quadRects`) instead. That is a structural win independent of the frog.

**Two behaviour contracts had to be respected, and both were about shape rather than geometry:** `poseFrog` reads
`leg.mesh.rotation.x`, so limbs are wrapped in `{ mesh }`; and the tests describe a frog as TWO LONG HIND LEGS AND TWO
SMALL FORELegs, marking the forelegs with `front` -- which is exactly how vanilla splits `arms` from `legs`.

**HONEST STATUS: the frog renders white.** Its geometry is right -- bulky body, four limbs, the croak sac -- and all
29 frog tests pass, but the material has no map, so the skin is NOT applied. I ran out of room to chase it this round
and I am recording it as unfinished rather than claiming it. Passing tests and a correct silhouette are not evidence
that a texture is bound; that is the same lesson as the turtle shell and the wolf.

Work list: **92 mob spawners, 54 with a real model, 38 still flat-colour only.** The frog counts toward models, not
skins, until its texture binds.

## Round twenty: the frog's texture found, and the rule behind it

**The frog is textured.** The cause was two lines of the builder's own contract that I had bypassed:

1. `resolveMaterials` obtains its sheet through **`ctx.loadTexture(url)`**. It does NOT accept a pre-loaded texture.
   I had passed `texture: this.loadTexture(FROG_SKIN_PATH)`, so `skin` stayed `null` and no map was ever bound.
2. The default material only receives the sheet on this line:

   ```js
   if (skin && !definition.color) adoptWhenReady(material, skin, 0xffffff, ctx);
   ```

   ...and that path is **skipped entirely when a `default` material is supplied**. I was handing in
   `materials: { default: bodyMat, ... }`, so the one place the frog's sheet could have been bound was never reached.

So the frog needed a `loadTexture` hook and to NOT supply a `default` material. Both fixed; the frog now renders in the
frog's own ochre and tan with darker legs and feet.

**This is the THIRD distinct way "the mob renders, so the texture is bound" has been false in this project:**

| # | cause | symptom |
| --- | --- | --- |
| 1 | rectangle on empty sheet (turtle shell) | fallback colour |
| 2 | bitmap never uploaded (husk, ocelot canvas) | black |
| 3 | builder contract bypassed (frog) | white |

All three look like a deliberate art choice, and all three were invisible to every test. That is why the audit keeps
the count as MODELS and SKINS separately, and why it is worth stating that a passing suite and a plausible silhouette
are not evidence of a bound texture.

**Known remaining fault, recorded not hidden:** one of the frog's flat layers renders standing upright rather than
lying flat, so my `rotate` for those planes is wrong. The geometry is otherwise right.

Work list: **92 mob spawners, 54 with a real model, 55 with a real skin, 38 still flat-colour only.**

## Round twenty-one: the warden was sampling the wrong half of its sheet

**I was wrong two rounds ago when I "reverted" the warden.** In round twelve the UV audit flagged the warden, I changed
its `texW`, rendering made it worse, and I concluded the audit was producing false positives and that the warden was
already correct. **The flag was real; my fix was wrong.**

**The actual fault, now confirmed from the decompiled `WardenEntityModel` (`class_7280`):** the warden's sheet IS
128x128, and `createBoxWithUV` divides each sprite coordinate by `texW`. I was passing **64-unit sprite coordinates with
`texW = 128`**, so every rectangle landed at **half** its intended position -- the torso's `u = 16` became 12.5% of the
sheet instead of 25%. Every warden part was sampling the wrong half of its own texture.

Round twelve's attempt failed because I changed the DIVISOR to 64 while leaving the coordinates in 64-space; the
coordinates needed to move into 128-space. Same bug, opposite half of the fix.

**Corrected from the decompiled values, and each block verified against the sheet before use:**

| part | (u,v) | size | faces measured |
| --- | --- | --- | --- |
| head | (0,0) | 18x21x11 | 100% opaque |
| torso | (0,32) | 16x16x10 | 100%, 160-256 dark texels |
| arm | (44,50) | 8x28x8 | 28 tall, not the 24 I had |
| leg | (76,48) | 6x13x6 | 100% |

The render now shows the warden's **rib and tendril detail** on the arms and legs -- pale ribbed shapes that were
simply not being sampled before. The mob was previously a dark silhouette with a core; it now has its own texture.

**Worth recording as a correction:** I wrote in round twelve that "the warden was already correct and the flag was my
tool's false positive". That was wrong about the flag and I should have kept investigating rather than closing it. The
lesson is not "trust the audit" -- the audit's own arithmetic modelling is still unreliable -- but "a flag from a
measured tool deserves an explanation, not a dismissal".

**Deliberately left out:** the warden's ribs and tendrils are FLAT (`0.0F` deep) planes in vanilla. They need `plane`
parts and their own rotation, and the body proportions mattered more this round.

Work list: **92 mob spawners, 54 with a real model, 55 with a real skin, 38 still flat-colour only.**

## Round twenty-two: the warden's body and head were swapped

Round twenty-one fixed the warden's coordinate SPACE (64-unit sprites were being divided by `texW = 128`). This round
found that I had also mapped the wrong BLOCKS to the wrong parts:

| part | vanilla, from `class_7280` | round twenty-one used |
| --- | --- | --- |
| body | **18x21x11 at (0,0)** | 16x16x10 at (0,32) |
| head | **16x16x10 at (0,32)** | 18x21x11 at (0,0) |

**Both rectangles are 100% opaque**, which is precisely why neither looked obviously wrong. A swapped pair of valid
blocks is invisible to an opacity check -- it only shows up as "the proportions are off and the face is not where I
expect it". That is a blind spot in the audit worth naming: it verifies that a rectangle HAS art, not that it is the
RIGHT art.

The warden now wears its body's rib and tendril texture on the torso, its own head art, 8x28x8 arms and 6x13x6 legs.

**Still outstanding, and recorded rather than hidden:** the head sits too low relative to the horns and eyes, so the
face does not line up with the eyes I model separately. That is a placement value, not a geometry error, and it wants
one more pass.

**The flat parts are now measured and deliberately deferred.** Vanilla gives the warden:

* right ribcage **9x21x0** at (90,11), left ribcage the same mirrored;
* right tendril **16x16x0** at (52,32), left tendril **16x16x0** at (58,0).

Their zero depth is why they can never be boxes -- the same shape as the vex's wings and the frog's tongue and
hands. They need `plane` parts, which the builder now has, plus the rotation work.

Work list: **92 mob spawners, 54 with a real model, 55 with a real skin, 38 still flat-colour only.**

## Round twenty-three: the warden's parts were placed for a different scale

**Placement, not geometry, was the last fault.** `class_7280` builds every part inside a `bone` at **(0, 24, 0)**, with
the body at (0,-21,0) relative to it and the head a further (0,-13,0). Because that bone sits 24 units (1.5 blocks)
above the origin, a part's real height is `24 + boneOffset + partOffset` units.

I had been using the raw offsets as if the bone were at the origin, which put the head at 2.4 -- above the horns -- and
left the eyes floating clear of the face. The decompiled arithmetic gives the torso a centre around **1.69** and the
head around **2.85**, and the warden now assembles as one creature: dark sculk body, cyan eyes set in a textured head,
the cyan core on the torso, and the pale rib texture running down the arms and legs.

**The warden has now taken three rounds to get right, and each round found a DIFFERENT fault:**

| round | fault found |
| --- | --- |
| 21 | coordinates in 64-space divided by `texW = 128`, so every part sampled half-off |
| 22 | body and head blocks SWAPPED -- both valid and opaque, so no check caught it |
| 23 | part positions used raw offsets with the `bone`'s 24-unit lift omitted |

That is a good argument for the approach that finally worked: **decompile, then read every value rather than
translating any of them by intuition.** Each of the three faults was invisible in isolation and only the render plus
the source together exposed them.

**Still deliberately deferred:** the flat parts. Vanilla's warden has a ribcage 9x21x0 at (90,11) and tendrils 16x16x0
at (52,32) and (58,0). Zero depth means planes, and they need their own rotation work.

Work list: **92 mob spawners, 54 with a real model, 55 with a real skin, 38 still flat-colour only.**

## Round twenty-four: the decompile chain is now one command

**`scripts/mob-visual/decompile-model.mjs`** turns the whole method that has been working into a single invocation:

```
node scripts/mob-visual/decompile-model.mjs --list                    # 91 entity model classes
node scripts/mob-visual/decompile-model.mjs BatEntityModel            # decompile + report its cubes
node scripts/mob-visual/decompile-model.mjs --grep Frog               # find one by name
```

It finds a Java runtime (PATH, an unpacked Temurin under `%TEMP%\jdk`, or a system install), caches the Yarn mappings,
translates `WolfEntityModel` to `class_624`, extracts **just that class** from the Fabric jar, runs Vineflower on the
file, and prints each part's `uv` / `cube` / `dilated cube` / `texture size` calls paired with the part name.

**An API shortcut worth knowing: name the mob, not its intermediary id.** `--list` prints all 91 models with their ids,
so `BatEntityModel` finds `class_553` without the mappings arithmetic that took several rounds to work out by hand.

**Four faults had to be fixed to make it run, and every one was a silent-wrong-answer bug:**

1. `-e=` did not filter. Vineflower ignored the name and decompiled all 23,000 entries. Extracting the single class and
   passing a FILE fixed it.
2. With the path-qualified class name it wrote to `.../net/minecraft/net/minecraft/class_553.java`, so a lookup of the
   expected path found nothing.
3. The mappings give the FULL path (`net/minecraft/class_553`), and prepending the package produced
   `net/minecraft/net/minecraft/...`.
4. The mappings file has **CRLF** line endings, so a bare `split('\n')` left a trailing `\r` on each field.

**First mob through the new tool: the bat.** Its whole model is FLAT except the body and head:

| part | (u,v) | size |
| --- | --- | --- |
| body | (0,0) | 3x5x2 |
| head | (0,7) | 4x3x2 |
| right/left ear | (1,15) / (8,15) | 3x5x**0** |
| right/left wing | (12,0) / (12,7) | 2x7x**0** |
| wing tips | (16,0) / (16,8) | 6x8x**0** |
| feet | (16,16) | 3x2x**0** |

Texture 32x32. Six of its nine parts are planes -- the third mob where that is the case, after the vex and the frog.

Work list: **92 mob spawners, 54 with a real model, 55 with a real skin, 38 still flat-colour only.**