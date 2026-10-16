# Blockyland Movies

The initial page's **Movies** link opens `movies.html`. It is a normal link and
works before the game engine finishes loading. The collection uses native HTML
video with keyboard-accessible modal playback, fullscreen controls, downloads,
deep links (`?watch=well-see-claude`) and a link to each live 3D preview.
MP4 files and posters live in `public/movies/` and are included in static builds.
The catalogue uses Vite's base URL so project-site deployments work too.

How the films are made, and the standards they meet, is in
[CINEMA_GUIDELINES.md](./CINEMA_GUIDELINES.md).

## 01 · 守株待兔 — Waiting by the Stump

127 seconds. A farmer works his field from sunrise to sunset while his neighbour,
Auntie Li, and her grandson Hu farm the next field. A rabbit races out of the woods and
knocks itself out on a stump. The farmer decides to stop working: he drops his hoe in the
field and waits by the stump for more rabbits. A time-lapse shows the season pass. His
field fills with weeds while Li's wheat turns gold, and the one rabbit that does come runs
away. At harvest Hu asks if any more rabbits came ("Not one"), and Li gives him seeds for
spring. He walks back to his hoe and starts clearing the weeds at sunset.

Files: `stumpLines.js`, `stumpStory.js`, `stumpSets.js`, `stumpFilm.js`, `stumpScore.js`.
Voices are in `public/cinema-stump/audio/`.

## 02 · 塞翁失马 — We’ll See

178 seconds. On moving day Mei refuses to help pack. Grandpa tells the
frontier-horse parable as a sepia "storybook" with its own hut, corral and frontier
wall. Back home, Dad lifts the last trunk and a wagon wheel breaks. That is bad luck
for little Bo, who wanted to go, and quietly good luck for Mei. She comforts him
anyway: "Bad luck? Maybe. We'll see." The broken wheel takes Dad to the village
wheelwright, who offers him work, so the family stays for now.

Files: `claudeLines.js`, `claudeStory.js`, `claudeSets.js`, `claudeFilm.js`, `claudeScore.js`.
Voices are in `public/cinema-claude/audio/`.

## Shared toolkit

| Module | Role |
| --- | --- |
| `claudeStage.js` | Renderer, lights, block-textured props, authored voxel world, sky, mountains, clouds, path decals, looks |
| `claudeActors.js` | Painted player-model actors, pose rig, walk blocking, blinks, horse gaits |
| `claudeFace.js` | 32×32 expressive faces and expression presets |
| `claudeDirector.js` | Voice validation, lip-sync, acting helpers, camera grammar, compositor, playback/export API |
| `claudeSound.js` | Offline mixer: voices with ducking, zither/flute/pad/bell/drum, derived foley, ambience |

## Production

```powershell
node scripts/narrate-claude.mjs stump-claude              # or well-see-claude
node scripts/render-film.mjs --movie=stump-claude --preview
node scripts/render-film.mjs --movie=stump-claude --publish
node scripts/check-movies.mjs
```

`--publish` copies the finished video and poster into the local app's public
collection; it does not deploy anything. The exporter uses an isolated temporary
Vite server, headless Edge and FFmpeg, rendering on a fixed 24 fps clock regardless of
how fast the machine renders.

Review frames, the storyboard, soundtrack and edit report go to `outputs/<film>/`.
Browser journey checks and desktop/mobile screenshots go to `test-results/movies/`.
