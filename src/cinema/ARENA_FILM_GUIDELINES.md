# Agent Arena Film Guidelines
## How we film AI-vs-AI games, and the bar every arena film must clear

These rules apply to every film of an Agent Arena run: a SkyWars series (`scripts/arena-series-film-data.mjs`), a
Bed Wars series (`scripts/bedwars-series-film-data.mjs`), or a single duel. The general film rules in
`CINEMA_GUIDELINES.md` (cameras guarded for the whole shot, overlays laid out in 1280×720, rendering) still hold;
this file adds what is particular to filming bots playing a real game.

Every rule here exists because a film broke it and the viewer noticed. The mistake log at the end lists them.
**`scripts/check-arena-film.mjs` enforces the checkable rules, and `scripts/render-film.mjs` will not render an
arena film that fails it** (`--skip-check` overrides it; a reason to use it is a film that was published before the bar
existed and is only being re-encoded).

---

## 1. The game comes first: a film cannot fix a wrong game

A film is a record of what happened. When a viewer asks "why didn't X happen?", look at the game and the
recording first, not at the film.

- **Check the game's rules against Minecraft Java before filming.** Each of these broke at least once:
  - **Death drops.** A player's dropped items must lie on the ground for Java's 40-tick (2 s) pickup delay.
    The SkyWars host used to hand the loot over on the next tick to whoever stood on it. The killer got it
    "instantly", and the film showed only "picked up" notices with no items on the ground. The host now keeps the
    delay (`src/mods/skywars/client.js` `DEATH_DROP_PICKUP_DELAY_MS`, tested in `tests/skywarsClient.test.js`).
  - **Bed Wars has no death drops, on purpose.** Iron, gold, diamonds and emeralds go straight to the killer, or
    are lost with no killer, as on Hypixel. Do not invent ground loot for a Bed Wars film.
  - **Digging takes time.** Breaking a block used to be instant, so a bed's cover cost a rusher nothing. Digging
    now takes Java's time (`guestPeer.js` `breakMs`; wool 1.2 s by hand, end stone 15 s). A bed break in a film
    should show the digging.
  - **The closing zone ends games.** Two of five SkyWars games, and one Bed Wars game, ran out the clock while
    players hid. The zone's void line is one block under the middle's tops, and hiding under an island counts as
    the void.
- **Run `node scripts/check-arena-film.mjs --movie=<film>` as soon as the recording exists.** It warns when death
  drops were taken before the pickup delay. On a recording made before the fix, the film holds the loot on the
  ground for 0.8 s so it can be seen. On a new recording, the warning means the game is wrong again: fix the game
  and replay the series rather than film it.
- **Say so when a fix only applies to new games.** A recording keeps the rules it was played under. After a game
  fix, list every film whose recording is affected, then re-record or re-render each one, or tell the user which
  films still show the old behaviour. Never leave the user to discover it in a film.

## 2. Coverage: show what decided each game

- **Every elimination is on a live shot**, with how it happened (killed, knocked into the void, swallowed by the
  zone, fell) and by whom. In Bed Wars this means every final kill; respawning deaths go in the kill feed. Deaths a
  few seconds apart share one shot (a group camera on the victims and killers).
- **Every bed break gets a live shot and a slow-motion replay**, the breaker followed as it bridges in and digs.
- **Every squad elimination gets its banner**, with its finishing place.
- **Each game ends on the deciding moment, its replay, and a result card** with the finishing order.
- **Quiet stretches are compressed, never silently cut.** A gap of more than about 45 s of play between moments
  gets a fast-forward "meanwhile" shot (an aerial at several times speed). The commentators use it to say how the
  game is going: who holds the middle, who is gearing up, who is still at home. Without it, a cut from 1:06 to 4:45
  leaves the viewer lost.
- **The closing zone gets one fast shot per game** when it starts: the border and the rising void are drawn
  (`arenaDuelFilm.js` draws them from the game's `zone`).
- **Every draw, standoff or "nothing happened" stretch is explained on screen, not only in words.** A game that ends
  at the time limit must have:
  1. a **cross-section** (`card.slice`): the map cut open through the hiding place, from the real blocks at that
     moment. It shows both players, the rock between them, the blocks the players placed, the void, the height gap,
     and notes that appear one at a time with arrows to the spot ("the only way in: from this side, over the
     void");
  2. a **reasons card** (`card.explain`): what each bot was trying to do and why it could not, from its own log,
     with counts ("moving toward DeepSeek", 987 times; "getting off a ledge", 662 times; no digging, no stair);
  3. the live standoff, with on-screen markers on both players (`standoff`), so a player hidden behind rock is
     still placed.
  The checker fails a time-limit game with no `slice` and `explain` card.

## 3. Commentary: two voices, all the way through

The first cuts of the rematch films only spoke at knockouts. Long silent stretches made them feel like a
highlight reel, and the user had to ask twice for continuous commentary. The bar:

- **No silence longer than 6 s anywhere** in the film, cards included. Commentary covers **at least 70%** of the
  running time; aim for 80%. Every live or replay shot longer than 5 s has a line.
- **Two voices with different jobs.** The play-by-play caller (`pbp`) says what is happening ("Gemini4 breaks Sol's
  bed!"). The analyst (`color`) says why, and whether it was smart. A shot usually has one of each.
- **Talk about strategy, not only kills.** For each squad or bot, say what its plan is, when it works, and when it
  fails, with the evidence:
  - Use the bots' own status lines ("doing": "rallying on the middle before the closing void", "holding wide
    ground", "approaching isolated Opus"), their health, their gear (wooden swords at the endgame), and where they
    stand (on the middle, three blocks too low, under an island).
  - Name what went well and what could have been better: "Sol held the high ground and still lost three: its players
    were already worn down"; "Opus never bought the gear its plan promised"; "staying home is not the same as
    guarding".
  - Build storylines across games: the rusher who breaks five beds, the squad that leaves home early and loses its
    bed every game, the plan that won game 1 and then fell apart.
- **Ground every claim in the records, and check every number.** Counts of beds, kills, wins and points come from
  the recording and `summary.json`, never from memory. One draft credited Gemini4 with seven beds (it had five) and
  said DeepSeek lost its bed "four games running" (four of five, not in a row). Before voicing, check each line
  against the fact sheet (section 5).
- **Avoid templates.** Generated lines ("X is eliminated, fourth place!") are a skeleton at most. Write the lines,
  vary them, and keep the big calls for big moments (`act: 'the winning call: scream it with joy'`).
- **Time lines from their voiced length.** Real speech runs about 0.42 s a word, slower than a guess of 0.34. The
  edit generators place lines one after another from the clips' measured durations
  (`narration/manifest.json`), and **lengthen a shot** (playing it a little slower) rather than cut or overlap a
  line. `narrate-arena.mjs` must report "No overlaps". A call about an event comes as or just after it happens,
  never before.
- **Re-voicing changes neighbours.** The voice performs each line after the one before it, so changing one line can
  change the next clip's length. After any re-voice, re-run the timing (generate, voice, check) until it is stable.

## 4. Pictures and graphics

- **Colours follow the game.** In Bed Wars a squad's base colour changes every game; its players wear that game's
  colour, with leather armour dyed to match (`dyeLeather`), so bridges, beds and shirts agree. The scoreboard
  labels squads by agent, coloured by the current base.
- **The HUD tells the state of the game at a glance.** Bed Wars: each squad's bed (BED / NO BED), players left,
  and OUT. A roster with health, "respawning" and ✕ for out. A kill feed with every death (FINAL marked). Banners
  for BED DESTROYED, TEAM ELIMINATED, FINAL KILL and the announcements. SkyWars: players standing, rosters, pickups.
- **Loot is visible.** A death drop lies on the ground at least 0.8 s in the film, even when the recording hands it
  over at once, then flies to its taker.
- **Keep the bottom third for subtitles.** Notes, banners and diagram labels stay between y 150 and y 590 (in 1280×720
  units). A diagram's key goes under its title, not at the bottom.
- **Diagram notes must not cross.** Place each note on the side of the thing it points at, and preview the frame.

## 5. Process

1. **Record**, then build the film's recording: `scripts/arena-series-film-data.mjs` (SkyWars) or
   `scripts/bedwars-series-film-data.mjs` (Bed Wars), into `public/cinema-arena-duel/<id>/`.
2. **Read the games before writing a line.** Make a fact sheet of every shot: its game clock, the deaths, beds and
   outs in it, and what each player in it was doing (the `autopilot_status` "doing" lines in
   `round-N-*/recording/events.jsonl`), their health and height. The commentary is written from it.
3. **Cut the edit**: `scripts/bedwars-film-edit.mjs` or `scripts/skywars-film-edit.mjs` generate the shots. The
   commentary lives in `src/cinema/commentary/<film>.js`, one entry per shot, and is passed with
   `--commentary=`. A hand-written edit (`arenaSeriesEdits.js`) follows the same rules.
4. **Voice**: `node scripts/narrate-arena.mjs --edit=<key>`, then regenerate the edit so lines take their measured
   lengths, then voice again, until it reports no overlaps.
5. **Check**: `node scripts/check-arena-film.mjs --movie=<film>`. It must say `clean`.
6. **Preview** the key shots (`render-film.mjs --preview` with `REVIEW_TIMES=...`): every diagram and card, a bed
   break, a final kill, the zone, each result. Look at them full size.
7. **Render**: `render-film.mjs --movie=<film>` runs the check again first. Run it detached
   (`Start-Process ... -WindowStyle Hidden`, logging to a file) or in the user's own terminal; a background shell
   of the assistant may be stopped partway (see `CINEMA_GUIDELINES.md`). Render one film at a time, never alongside
   a series of games. If progress stops, look at the newest segment in `outputs/<film>/segments-*/`: a render
   resumes from the first missing segment. One 1,200-frame segment took two hours while the computer slept, so a
   render that has stalled may only be paused.
8. **Verify the video**: duration (`ffprobe`), frames from the new scenes (`ffmpeg -ss`), and the audio report.

## 6. Editing safely

- **Scene names and line ids are not unique across films.** Many edits have a "Game 3: replay" and lines `n01`-`n39`.
  A script that edits `arenaSeriesEdits.js` must limit itself to the one edit it was given (search from that edit's
  `id:`). One re-spacing script changed two scenes of another film this way.
- **Compare other films with their renders after a shared change.** Rebuild each series film's scene and line
  timings from `outputs/<film>/review.json` (scene midpoints) and `audio-review.json` (line starts) and compare them
  with the edit. They must match, unless the change was meant for them.
- **Keep the old and the new.** A re-made film replaces its video only when the user asked for a re-make; a rematch
  is a new film (`<id>-r2`), so the first one stays.

---

## Mistake log

| What the viewer saw | Cause | Rule now |
| --- | --- | --- |
| No items dropped when DeepSeek died; only "picked up" notices | The SkyWars host handed death loot over on the next tick | §1: Java's 2 s pickup delay in the host; the film holds loot 0.8 s; the checker warns |
| A bed rush cost nothing; covers were pointless | Digging was instant in the bot client | §1: Java's dig time, and films show the digging |
| Games 3 and 5 of the SkyWars series ended in draws, unexplained | Players hid under islands; bots would not step off edges or dig | §1: the closing zone; §2: a cross-section and a reasons card for every draw |
| Comments only at knockouts; long silences | Generated commentary was one call per elimination | §3: ≤ 6 s silence, ≥ 70% speech, strategy and evaluation; checked |
| The rematch films repeated both mistakes after they were reported | The fixes and feedback were not written down or checked | This guide, and `check-arena-film.mjs` run by `render-film.mjs` |
| Wrong counts in the commentary (seven beds for one rusher) | Lines written from memory | §3: every number from the records |
| Lines overlapping, or cut by the next shot | Lines placed by a word-count guess | §3: timing from voiced clips; shots lengthened |
| Everyone in brown | Undyed leather armour hid the team colours | §4: leather dyed in the squad's colour of that game |
| A 3.5-minute jump in a game with no explanation | Moments only, nothing between | §2: "meanwhile" fast-forward shots |
| Another film's scenes changed | A script matched a scene name in the wrong edit | §6: edit only the given edit; compare with renders |
| Diagram notes crossing each other and the subtitles | Notes placed without a preview | §4: notes in the y 150-590 band, previewed |
