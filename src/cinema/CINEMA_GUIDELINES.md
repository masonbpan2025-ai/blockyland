# Blockyland Film Guidelines
## How we make a film, and the bar every film must clear

These are the methods behind **01 · 守株待兔 Waiting by the Stump** and **02 · 塞翁失马 We’ll See**.
Each rule exists because breaking it produced a visible or audible fault in an earlier cut:
characters walking backwards, paths sunk like trenches, flickering limbs, flat 8×8 faces,
and one robotic voice reading every line, questions included.

---

## 1. Story

- **Story first.** Write the screenplay before building anything. Every event should be
  caused by the one before it. In *We’ll See*, the broken wheel sends Dad to the workshop,
  and the workshop is where the job offer comes from. Avoid coincidences that only exist
  to end the film.
- **Show the fable in the family.** An old story lands harder when a character has to
  use it. Mei comforts Bo even though the broken wheel is good luck for her. The farmer
  picks his hoe back up after his neighbour is kind to him.
- **Characters speak; the narrator bridges.** Keep narration for time jumps and the
  opening and closing lines. Everything else is dialogue.
- **Length:** 2–3 minutes. Every scene must change something.
- **Audience:** family-friendly. Keep accidents and injuries non-graphic. A lesson is
  about patience, kindness or effort, never a promise that luck always turns out well.
- **Bilingual:** every line has idiomatic Chinese (`zh`) and English (`en`). The `say`
  field holds the spoken English when the rhythm needs different punctuation; `...` gives
  the voice a breath.

## 2. Voices

- **One clip per line, one neural voice per character** (edge-tts). The cast lives in the
  film's `*Lines.js` file. The narrator is the same voice in every film (`en-US-AvaNeural`).
  Children use `en-US-AnaNeural`; siblings are told apart by pitch and rate.
- **Questions must sound like questions.** `narrate-claude.mjs` measures the pitch
  contour of every line ending in `?` and records `endPitchRatio` in the manifest.
  Yes/no questions ("Good luck?", "Really?", "Did any more rabbits come?") must rise at
  the end; *wh-* questions may fall naturally. Audition the voice when a question comes
  out flat. Known behaviour: `ChristopherNeural` falls on short questions;
  `AndrewNeural`, `BrianNeural`, `GuyNeural` and `AnaNeural` rise.
- **Never speed up or stretch a voice.** Lay out the timeline from the measured clip
  durations (`*Story.js`). The director refuses to load if any clip would run into the
  next line (0.12 s minimum gap).
- Clips are trimmed of silence, peak-normalised to 0.89 and stored at 48 kHz, with a 48 Hz
  loudness envelope that drives lip-sync.

## 3. Faces and acting

- **Expressive faces.** Every character wears a 32×32 face plane (`claudeFace.js`): brows
  that tilt, irises with highlights, lids, mouth shapes, blush, tears, wrinkles and a wink.
  Each visible character has an **expression track**: timed keys that blend over 0.35 s.
  Nobody keeps one face through a scene.
- **Alive by default.** Blinks are deterministic, every 2.6–4.8 s. Speaking characters'
  mouths follow their voice, brows lift on stressed syllables and the head nods slightly.
  Bodies breathe.
- **Walking.** Every move is blocking (`at([[t, x, z, yaw?], …])`). Walkers always face
  their direction of travel, turns are smoothed, and the stride comes from distance
  travelled, so feet never slide. Ground height follows steps and porches.
- **Posing.** Use the hip-bend `lean`, `sit` with a real `seat` height, `kneel`, and
  per-arm angles. Heads `look` at people or points, applied after every body is placed so
  mutual looks are frame-exact. Hands that meet must not share a face plane. Player-model
  overlay shells stay hidden; they z-fight and flicker.
- **Limbs move toward the face.** A reach, point, wave, hands-on-table or a seated knee must
  end up on the side the character faces. The whole of *1500 Players* was first rendered with
  every arm and seated leg pointing backward: its characters face −z, and in three.js a
  *negative* x-rotation swings a hanging limb toward +z, behind them, while every pose was
  written as "negative = forward". To keep it from happening again:
  - **Write down the convention once, in the pose function**, and apply it there, never pose by
    pose. In `civCast.js` authored limb angles are "negative = forward" (`armR [-1.5, z]` reaches
    ahead, `[-2.9, z]` is overhead, `sit` lifts the knees forward) and `posePlayer` applies them
    negated (`LIMB`). Instanced crowd arms follow the same rule (`armUp` is +2.8 rad).
  - **Test the rig, not the pose.** `checkRig()` poses every character reaching forward and
    sitting at three headings and measures that the arm and the knees end up in front of the
    face direction; the film refuses to load if any fails. Skip limbs a character does not
    have (four-legged animals and vehicles have no arms; a tail is not legs). A new film with
    a new rig or a different facing must ship the same check.
  - **Look at one gesture from the side** before rendering a whole scene: a forward reach seen
    from the front can pass for correct, because an arm pointing straight back at the lens and
    one pointing straight at it look much alike. Seated characters and three-quarter angles
    show the error at once.
  - **Change every sign together.** Fixing the convention also flips everything that read
    the old sign: the continuity check once recognised a seated actor by "leg rotation below
    −1", and after the fix reported seated actors as sunk in the ground. Test sign-independent
    properties (`Math.abs(rotation) > 1`) where you can.
  - **The sideways sign too.** An arm's z angle is "positive = outward" for the right arm and
    "negative = outward" for the left. Folded arms are the opposite (`armL [-1.25, .75]`,
    `armR [-1.25, -.75]`); written with the outward signs they read as arms flung wide, which is how
    every "arms crossed" in the first *Three Weddings* key frames came out. Keep one named pose
    (`CROSS`) and use it everywhere.
- **Props never pop.** Carried things are placed with `hold()` and handed over along an
  `arc()`. Teleport a character or prop only on a cut, or in the dark between time-lapse
  days.
- **Props must not cover the face that is talking.** A prop placed at an adult's hip sits at a
  child's face. Place carried props relative to the carrier's head or hands, and lift them clear
  (overhead, to one side) for the carrier's own lines.
- **Crowds have faces too.** Instanced crowd players get a face on the head's front, tinted by
  their skin colour. A blank head reads as a mannequin even in the back row.
- **Scale and household.** Adults 1.0, elders 0.9–0.95, children 0.55–0.75. A building
  matches who lives there: a lone farmer gets a one-room cottage, and a three-generation
  family gets a raised house with a porch.

## 4. Sets

- Build with the game's own blocks and mesher (`claudeStage.js`). Prop meshes use the real
  block textures through `texBox` / `blockTex`, so wood, hay and stone match the voxels.
- **Paths and roads are flush decals** (`decal`). Never use `DIRT_PATH` blocks; they render
  as trenches.
- **Foliage tint:** only grass tops and `OAK_LEAVES` are tinted by the mesher. Spruce and
  birch leaves, grass tufts and ferns render grey. Use oak leaves on every tree. Plants
  that grow (wheat, weeds) are tinted cross-plane meshes, so seasons can change them
  frame by frame.
- **Check every reverse angle.** Several sets share one world, so screen them from each
  other with tree rows and terrain. Distant mountains are unlit silhouettes with a paler
  far ridge, recoloured for dusk.
- Dress with purpose: tools, baskets, woodpiles, lanterns, fences (built as props) with gates
  where people walk.
- **Keep generated dressing off the marks.** Scattered trees, rocks and props must stay clear
  of every place an actor stands or walks and of the close-up cameras around them. Clear and
  level the ground there (a yard, a compound floor), so walks never climb 1-block steps.
- **No coplanar faces.** Two boxes whose faces lie in the same plane, face the same way and
  overlap z-fight: the surface flickers between their colours whenever that side turns to the
  camera. It hides in the natural way of building block figures: a hand cube ending flush with
  its sleeve (seen when an arm is raised toward the lens, as Pocoyo's cheering hand was), a sole
  flush with its leg, a hair cap flush with the face, a crowd's hair box sharing the face's plane.
  Offset a shell by at least 2 cm, or end a detail a few millimetres past the part it sits on.
  In *1500 Players* this is enforced, not remembered: `makeCharacter` and the film's props run
  `separateCoplanar()` (`civCast.js`), which moves the smaller box of every such pair out by
  6 mm, and the continuity check reports any flush faces left in a visible actor or prop.
  A new film's builder should do the same, but must skip instanced meshes (crowds): an
  `InstancedMesh`'s own box stands for every instance, so moving or scaling it shifts every
  crowd member's body part. That bug left limbs floating in the air above every crowd.
- **Ground height must follow the set.** Actors stand on `groundAt`. When a structure changes the
  ground (a palace floor, a terrace, a dug-out courtyard), update the ground map in the same
  `put`, or actors sink into the floor (Frieza stood 0.75 m into his palace's ice).
- **Give every set a plaza.** Level the ground under each set where the cast stands, walks or
  rides, bank it smoothly back into the land, and keep trees off it and off any route (the
  train's line). Two carts racing need two rails.
- **Use the game's own textures for props too.** Fire is the game's `fire.png` on crossed planes
  over `campfire_log.png` logs, not a glowing cone; a throne is purpur, purple wool and gold,
  not flat coloured boxes. Load them with `blockTex`.
  - **Check a texture's alpha before using it as a cut-out.** This repo's crop textures
    (`carrots_stage_*`, `wheat_stage_*`) are almost fully opaque, so on crossed planes a field of
    carrots renders as green squares. Count the transparent pixels first
    (`ffmpeg -i x.png -vf alphaextract …`); where a texture has none, build the plant from small
    blocks instead.
- **Know a set's footprint before you put a mark on it.** Read the world generator for the site
  (the bakery is 15 × 11 blocks around its point; Pocoyo Park is a sandpit with a slide, a swing
  frame and a rail run) and put marks and lenses in the open part of the plaza. Marks guessed from
  the site's point put a wall, a slide or a hillside in front of the lens.
- **Use full blocks in film sets.** The film mesher draws cubes only. Shaped blocks (fences,
  slabs, stairs, panes, walls, signs) come out invisible, leaving whatever stood on them
  floating. Use logs, planks or wool, or build the shape as a prop.
- **No tiled stripes on big see-through surfaces.** A world border painted with Minecraft's
  diagonal stripes, repeated every few metres on 70 m walls, reads on screen as scan lines
  across everything behind it. Use a soft gradient: bright at the base, fading upward.

### Generating a large set (castle, village, landmark)

Big sets are generated, not placed by hand. This method produced the Ivy Stone Castle,
which was clearly better than the same castle placed block by block from the same prompt.

- **Start from a reference.** Collect a reference image, or write a one-line silhouette,
  before writing code. Note the proportions that make it read: tower height to width,
  which element is the focal point, and what sits in front of what.
- **Write a generator, not a block list.** Write small seeded functions for each piece
  (`roundTower`, `curtainWall`, `gatehouse`, `spire`, `tree`, `hedge`) and call them from
  a layout. Name the ground level, the symmetry axis and the key heights as constants, so a
  proportion fix is one number. Use a position hash (`rand(x, z, salt)`) for all
  randomness, never `Math.random`, so every render builds the same set.
- **No flat walls.** Mix block variants by a hash plus a slow noise, and make the stone
  mossier near the ground (for example stone bricks with mossy, cracked and cobblestone
  variants). Give every facade relief: a plinth at the base, buttresses at a steady rhythm,
  a string course, corbels under the battlements, and window recesses.
- **Build in passes, in this order:** terrain → water → masonry → openings (doors,
  windows, arches) → trim → furnishing → vegetation → ground cover. Openings, banners and
  doorways are marked as protected, so the vegetation pass cannot grow over them.
- **Grow the greenery.** Ivy hangs in strands from the tops of walls, a few blocks wide and
  of varying length, with more creeping up from the base. Hedges, bushes and trees frame
  the base of the walls and the edges of the shot. The sets rules above still apply: ivy,
  hedges and trees use `OAK_LEAVES` only, and paths are decals, not `DIRT_PATH`.
- **Look before you shoot.** Render the set from the film's main camera directions
  (`render-film.mjs --preview`), plus close crops of the focal element, and compare them
  with the reference side by side. Fix proportions first (focal element too short,
  neighbouring masses merging into one block), then detail. Expect at least two rounds.
- **Check every block.** Every block in the set must exist in `BLOCKS` and render as
  intended: no block that falls back to stone, and no untinted grey foliage.

## 5. Cameras and editing

- **Name every shot** in the film's shot list. Use the director's camera grammar:
  - `single(speaker, listener)`: a clean single from just off the listener's eyeline.
    The reverse shot uses the opposite angle sign (180° rule).
  - `front(actor)`, `move(...)`, `follow(...)`.
  - `ots` only when the listener is large and well back from the lens.
- **Never** put the camera behind a listener's head, inside geometry, or under a hat brim.
  `front()` places the lens along the actor's facing, so whatever stands in front of the actor
  (a tree, a machine) ends up in or before the lens; clear it or move the mark.
- **Guard every camera against everything visible:** the world, every visible prop and crowd,
  and the cast, except the shot's subject (a subject leaning toward the lens blocks its own line of
  sight). A guard that only knows the terrain lets heads, walls and tunnel props fill the frame.
  Also reject a lens inside a block, and one where anything within 1.6 m covers more than a fifth
  of the frame; a single ray to the subject's face misses a head or wall filling half the picture.
- **A camera correction is decided once per shot, never per frame.** Any rule that moves the
  lens (a guard, an obstacle dodge, a fallback position) must give the same answer for the whole
  shot. A guard that tested each frame on its own made the lobby dolly past the heroes hop
  between positions 1–7 m apart several times a second, because the line of sight brushed a
  different character every few frames. The *1500 Players* guard poses the shot at nine moments
  across its length (`poseAt`, no rendering), picks the first offset that is clear at all of them
  (or blocked at the fewest), and holds it. If no offset is clear for the whole shot, re-block the
  shot (move the camera path or the actors); do not let the guard improvise mid-shot. The
  continuity check flags a frame whose camera step is more than four times the step before it.
- **Aim at a person, not into a wall.** A target point inside a building leaves the guard
  nowhere clean to stand.
- **Block the actors for the lens, then place the lens in front of the speaker.** People talking
  face each other "cheated" toward the camera: each looks at a point between the partner and the
  lens (`mix(partner, lens, .3–.5)`), so both faces read in three-quarter view. Put the lens on the
  side the speakers face, with the sun behind it. Turning everyone toward the action ("they watch
  the ring", "they look at the tower") and then shooting from behind them shows a row of backs;
  turn them toward the lens instead (the heroes face us as the tower bursts behind them). A first
  pass of the *Three Weddings* key frames had a speaker's back to the camera in eight of 21 frames.
- **One object, one scene.** A three.js object has a single parent, so adding the shared island
  world to a second scene (a CCTV picture, an inset) silently takes it out of the first, and the
  main shot renders as empty sky. Build and render the inset first, then build the main scene.
- **Movers face their travel.** Riders (a cloud, a cart, a train) take the vehicle's heading;
  check the yaw convention once (`yaw` faces −z) instead of adding π by habit. Two flyers and two
  cart racers flew and raced backwards.
- **Flying pose:** body nearly level (`flyLean` ≈ 1.25), one arm forward, legs trailing, and the
  head pitched up (positive `headPitch`) so the face reads; shoot from ahead and level with the
  flyer so the line is delivered toward the lens.
- **Effects stay out of close-ups:** an aura's sparks cross the face in a close-up; use a
  spark-free aura there. Name tags are dropped for anyone hidden behind a wall.
- **When an actor turns to an object, shoot from beyond the object**, so the turn brings the
  face toward the lens instead of the back of the head.
- **Characters with tall hair:** keep the lens at or slightly above eye level. Looking up from
  below fills the top of the frame with hair.
  Typical distances are 1.6–2.4 m for adults and 1.1–1.6 m for children. Avoid steep
  up- or down-angles in close-ups, and keep tall props like weeds below a small
  character's eyeline.
- **Dissolves** (1.2–1.4 s) for changes of time or place. A storybook passage gets a warm
  flash in and out, a sepia grade, a heavier vignette and an on-screen label. Labels also
  mark time jumps ("A FEW DAYS LATER", "HARVEST TIME").
- A slight handheld drift keeps locked-off shots alive.
- **Keep the bottom third for subtitles.** Editor captions and banners go in the upper third.
  Small name tags that would overlap are dropped, the nearer actor's tag kept.
- **Pin a name tag to the top of the head on screen, never a distance in metres above it.**
  Project the top of the head's bounding box (hair, ears and hats included; not the whole body,
  which can include held props and effects) and lift the tag a few pixels. A fixed 0.3 m above the
  body is a sliver in a wide shot but half the frame in a close-up: MerCat's tag floated onto the
  soldier standing behind her.
- **Frame furniture.** Letterbox bars; Chinese subtitles above English; voice-over in
  italics. Title card with tagline; end card with the moral.

## 6. Light and colour

- **Named looks per scene** (sun direction, colours, sky gradient, fog, exposure, hill
  colour), applied with `applyLook`. Put the sun behind the main camera direction so faces
  are lit. Centre the shadow camera on the set in use.
- **Every face that speaks to us is lit.** Set lights are placed to dress the set (pool lamps,
  fairy lights, a lantern, a low sun), and the actor's mark is chosen for the blocking, so nothing
  makes sure light reaches the side of the face the camera sees. In a dim set the result is a
  black silhouette delivering the line: MerCat said "Welcome!" facing the lens with every grotto
  light behind her (her face measured 3 of 255). Do what a film crew does and give the shot a key
  light:
  - A soft point light rides just above and beside the lens (`keyLight` in `civFilm.js`), so it
    lights what the camera sees and falls off before the walls behind, keeping the set's mood.
  - Each shot measures its speaker's face in the rendered frame at three moments (the 75th
    percentile of luma over the middle of the head, so dark hair and eyes don't count) and turns
    the key up only as far as the darkest moment needs. Bright shots get no key and look exactly
    as before.
  - The level is decided once per shot and held, like the camera guard, so it never pumps.
  - Don't fix a dark face by raising the scene's exposure or ambient light. That flattens the
    whole set and still leaves a backlit face darker than its surroundings.
- Change time of day with purpose: dusk darkens the sky and lights lanterns, windows and
  fireflies. A time-lapse sweeps the sun across each day and dips into a blue night.
- Grade per scene with a canvas filter: storybook sepia, a warm autumn, saturated evenings.

## 7. Music and sound

Build every soundtrack on the shared kit (`claudeSound.js`), rendered offline at 48 kHz:

- **Score** uses a Karplus–Strong zither, a breathy dizi-style flute, pads, bells and a
  tanggu drum in Chinese pentatonic modes. It follows the story's turns: a theme per
  section, a sting per reversal, an unresolved phrase for "We'll see", and a resolved
  cadence at the end.
- **Ducking:** music drops ~7.5 dB under every spoken line.
- **Silence is a sound.** Cut the music for an impact (`musicGate`).
- **Foley comes from the animation.** Footsteps are derived from each walker's stride
  phase and the surface underfoot (wood, dirt or grass). Hooves come from horse gaits;
  tool strikes from the swing cycle. Add birds by day, crickets at night and wind.
- All randomness is seeded, so the same film always produces the same mix. The final mix
  is normalised to −18 LUFS.

## 8. Pipeline and quality checks

| Per film | Shared |
| --- | --- |
| `*Lines.js` screenplay and voice cast · `*Story.js` timed edit · `*Sets.js` set · `*Film.js` direction and shot list · `*Score.js` score and foley | `claudeStage.js` · `claudeActors.js` · `claudeFace.js` · `claudeDirector.js` · `claudeSound.js` |

```powershell
node scripts/narrate-claude.mjs <film>                     # voices + manifest (durations, lip-sync, question pitch)
node scripts/render-film.mjs --movie=<film> --preview      # review frames + storyboard.jpg in outputs/<film>/
node scripts/render-film.mjs --movie=<film> --from=0 --to=150  # a clip (<film>-clip.mp4) at full quality, never published
node scripts/render-film.mjs --movie=<film> --publish      # full render, copied to public/movies/
node scripts/check-movies.mjs                              # gallery, playback, deep link, mobile
```

**Diagnose before fixing.** For a visual fault, first find what is on screen: hide the world or
a prop group, toggle shadows, list the blocks at the spot. In *1500 Players* the "tree stump" in
front of Bulma was an acacia growing on her mark, and the "stripes on heads" were a hair box
sharing a plane with the face, not shadows. Keep one exported page open and send it experiments,
so the world is not rebuilt for each guess.

**Long films.** `render-film.mjs` renders in batches of 1,200 frames (`FRAME_BATCH`), each in a
fresh browser: reopening only the page let WebGL contexts pile up in the browser's GPU process
until, 3,600 frames in, it could not create another ("Error creating WebGL context"). Each batch
is encoded to its own segment (`outputs/<film>/segments-<fingerprint>/`), and a finished segment
is kept, so if a render stops, run the same command again and it resumes at the first missing
segment; at the end the segments are joined without re-encoding and the soundtrack is added.
The fingerprint covers the film's modules (`src/cinema/*.js`), `blocks.js`, `mesher.js` and the
page; a change there starts the segments over. A change elsewhere in the game that alters a
film frame is not detected: pass `--fresh` to discard the segments. Frames are a pure function
of `t`, so batches and resumes never change the picture.

**Render quality.** Every film is rendered and published with this method, which removes the
shimmer of thin block lines (floor grids, stone borders, grass) that 720p renders had. All of
it lives in the shared modules, so a new film gets it by building on `createStage`,
`meshWorld` and `createDirector`. Do not bypass them.

- **Supersample.** `render-film.mjs` opens the film page with `?export`. The renderer then
  draws at 3840×2160 (`FRAME` in `claudeStage.js`: 1920×1080 at 2× pixel ratio), and the
  director scales that down into the 1920×1080 frame. The live preview stays 1280×720 so
  playback stays smooth.
- **Mipmap the world atlas.** `meshWorld` gives the film a mipmapped copy of the block atlas.
  The chain stops at one pixel per 16-px tile, so neighbouring tiles never blend, and
  sampling uses the nearest texel within a level, so near blocks stay crisp. The game's own
  atlas is untouched. Never mesh a film world with the unmipmapped game material.
- **Lay out overlays in 1280×720 units.** Captions, cards, letterbox and `overlay(ink, …)`
  code draw in 1280×720 coordinates. The director's canvas transform scales them to the
  output frame, so they come out sharp. Draw full-frame images with an explicit size
  (`drawImage(img, 0, 0, 1280, 720)`), never at their intrinsic size. Never hard-code the
  output resolution.
- **Wide aerial shots** (whole islands from hundreds of metres, a block 1–3 px wide) need three
  more things, all set inside the film so the shared modules and finished films do not change:
  - *Minify trilinearly.* Set the world atlas's `minFilter` to `LinearMipmapLinearFilter` and keep
    `magFilter` nearest. Nearest sampling within a mip level makes every texture crawl as the
    camera zooms, while near blocks are magnified and stay crisp. This halved the flicker of the
    *1500 Players* map shot.
  - *Move the near plane out.* Depth precision falls with distance squared over `camera.near`: at
    0.1 m, a camera 500 m away resolves depth to about 15 cm, and the sea plane fights the shore
    blocks 12 cm above it. Use about 2 m for aerials, 0.1 m for close work.
  - *Opaque clouds with offset puffs.* See-through boxes re-sort as the camera moves, and puffs
    whose top faces share a height z-fight; both flicker.
  Tried without effect on that shot: turning shadows off, shadow bias, alpha-to-coverage on leaves.
  3× supersampling gained only 10% for twice the render time.
- **Do not hide geometry with noise.** Once the shimmer is gone, real edges show, such as
  1-block terrace steps in the distance. Judge them as set dressing and smooth the terrain
  if they distract.

1. **Run the continuity check.** The film first runs its rig check (limbs move toward the face;
   see *Faces and acting*) and stops if any character fails. Films that provide `pilot.check` (see `civFilm.js`) are checked
   by `render-film.mjs`: an actor inside a block, the lens inside a block, a speaker hidden or
   turned away from the camera, flush same-facing faces (z-fighting) in a visible actor or prop,
   a foreground (within 1.6 m) covering more than a fifth of the frame, a camera that jumps
   within a shot, or a speaker whose face is unlit in the rendered frame (luma below 36 of 255).
   Measure what the viewer sees: a geometric check can't tell a lit face from a silhouette, so
   read the pixels. Only actors on
   screen are checked, and a seated actor's legs may rest in the seat. The result is printed and written to `check.json`; it must be clean.
   Iterate on a long film with `--from/--to` clips before the full render.
2. **Review every shot at full size**, not only the contact sheet. Fix any shot where the
   camera is blocked, a face is unreadable, or something pops.
3. **Check the voice:** every yes/no question rises, and no clip overlaps the next.
4. **Check for flicker** by tiling consecutive frames of a close two-person moment
   (`ffmpeg … -vf fps=6,tile=4x3`), and in wide or moving shots by measuring it. The mean of
   |f₀ − 2f₁ + f₂| over three consecutive frames mostly cancels smooth camera motion and keeps
   flicker. Map it as an image to see where it comes from, then test one cause at a time
   (hide a group, turn off a feature) and keep only the changes that lower the number.
5. **Protect finished films.** After changing a shared module, re-render the other films'
   review frames and compare them pixel-for-pixel with the published render (threshold:
   8 levels). Also compare their soundtracks.
6. **Encoding:** 1920×1080 (2× supersampled), 24 fps fixed clock. Frames are captured as JPEG
   at quality 0.97 and encoded with H.264 High `yuv420p`, CRF 18, `-preset slow`, with no bitrate cap,
   and `faststart`. Audio is AAC 48 kHz 160 kb/s. Expect roughly 10–20 Mb/s, depending on how
   much fine detail (crops, grass) the film has.
7. **Check shimmer in motion, not only in stills.** Compare the frame-to-frame change of the
   far floor in a slow camera drift with the published version
   (`ffmpeg -ss <t> -t 3 -i film.mp4 -vf "crop=…,format=gray,tblend=all_mode=difference,signalstats" -f null -`).
   It must not go up.
8. A full 1080p render takes about 6–7 minutes per minute of film (a 3-minute film takes about 20 minutes) and a lot of memory. Close heavy apps first; Edge,
   Vite and FFmpeg run headless and are isolated from the dev server.
9. **The user runs the full render.** An AI assistant must not start `--publish` as its own
   background job; a long render leaves little free memory, and the assistant's tooling may
   stop it partway. Print the exact command (with the `cd` into the repo) and ask the user to
   run it in their own terminal first. Once it prints `Video written`, the assistant runs the
   checks above. Short `--preview` renders may still be run by the assistant.
