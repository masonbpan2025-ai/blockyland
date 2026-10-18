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
- **Props never pop.** Carried things are placed with `hold()` and handed over along an
  `arc()`. Teleport a character or prop only on a cut, or in the dark between time-lapse
  days.
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
- Dress with purpose: tools, baskets, woodpiles, lanterns, fences with gates where people
  walk.

## 5. Cameras and editing

- **Name every shot** in the film's shot list. Use the director's camera grammar:
  - `single(speaker, listener)`: a clean single from just off the listener's eyeline.
    The reverse shot uses the opposite angle sign (180° rule).
  - `front(actor)`, `move(...)`, `follow(...)`.
  - `ots` only when the listener is large and well back from the lens.
- **Never** put the camera behind a listener's head, inside geometry, or under a hat brim.
  Typical distances are 1.6–2.4 m for adults and 1.1–1.6 m for children. Avoid steep
  up- or down-angles in close-ups, and keep tall props like weeds below a small
  character's eyeline.
- **Dissolves** (1.2–1.4 s) for changes of time or place. A storybook passage gets a warm
  flash in and out, a sepia grade, a heavier vignette and an on-screen label. Labels also
  mark time jumps ("A FEW DAYS LATER", "HARVEST TIME").
- A slight handheld drift keeps locked-off shots alive.
- **Frame furniture.** Letterbox bars; Chinese subtitles above English; voice-over in
  italics. Title card with tagline; end card with the moral.

## 6. Light and colour

- **Named looks per scene** (sun direction, colours, sky gradient, fog, exposure, hill
  colour), applied with `applyLook`. Put the sun behind the main camera direction so faces
  are lit. Centre the shadow camera on the set in use.
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
node scripts/render-film.mjs --movie=<film> --publish      # full render, copied to public/movies/
node scripts/check-movies.mjs                              # gallery, playback, deep link, mobile
```

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
- **Do not hide geometry with noise.** Once the shimmer is gone, real edges show, such as
  1-block terrace steps in the distance. Judge them as set dressing and smooth the terrain
  if they distract.

1. **Review every shot at full size**, not only the contact sheet. Fix any shot where the
   camera is blocked, a face is unreadable, or something pops.
2. **Check the voice:** every yes/no question rises, and no clip overlaps the next.
3. **Check for flicker** by tiling consecutive frames of a close two-person moment
   (`ffmpeg … -vf fps=6,tile=4x3`).
4. **Protect finished films.** After changing a shared module, re-render the other films'
   review frames and compare them pixel-for-pixel with the published render (threshold:
   8 levels). Also compare their soundtracks.
5. **Encoding:** 1920×1080 (2× supersampled), 24 fps fixed clock. Frames are captured as JPEG
   at quality 0.97 and encoded with H.264 High `yuv420p`, CRF 18, `-preset slow`, with no bitrate cap,
   and `faststart`. Audio is AAC 48 kHz 160 kb/s. Expect roughly 10–20 Mb/s, depending on how
   much fine detail (crops, grass) the film has.
6. **Check shimmer in motion, not only in stills.** Compare the frame-to-frame change of the
   far floor in a slow camera drift with the published version
   (`ffmpeg -ss <t> -t 3 -i film.mp4 -vf "crop=…,format=gray,tblend=all_mode=difference,signalstats" -f null -`).
   It must not go up.
7. A full render takes 20–35 minutes and a lot of memory. Close heavy apps first; Edge,
   Vite and FFmpeg run headless and are isolated from the dev server.
