// Making or changing an Agent Arena film? Follow src/cinema/ARENA_FILM_GUIDELINES.md (the user's standing requirements),
// and pass node scripts/check-arena-film.mjs before rendering.
import { EDIT as FIVE_BOTS_R2_EDIT } from './fiveBotsR2Edit.js';
import { EDIT as BEDWARS_FIVE_R2_EDIT } from './bedwarsFiveR2Edit.js';
// Series films of the scripted arena (agentArena/scriptedArena.mjs): the agents' bots introduced, then every game of
// the series, played by the duel film (arenaDuelFilm.js) from a series recording (scripts/arena-series-film-data.mjs).
// A page picks its edit with <html data-edit="<id>">. A scene with `game: n` gives `g` (and `atG`) in that game's own
// clock: 0 is 3 s before its play began, so play time = g - 3.
//
// ds-low-vs-max: agentArena/runs/ds-low-vs-max, DeepSeek V4.1 Flash at low effort (DS-Low, Blue) against itself at max
// effort (DS-Max, Red), SkyWars at hard on Sub-Mid Cross (sky_ruins, seed 810198075). Every call was checked against
// the run's recordings (round-N-skywars/recording/events.jsonl, the film recording's frames) and the bots' own notes
// (bots/<name>/notes-plan.md, notes-changes.md):
//   - The bots: DS-Low (9.2 min; one file, the SkyWars playbook): the middle's chests before its own sub-mid's, and no
//     crossing it cannot pay for (blocks against void, +6). Practice: won 2 of 3. DS-Max (19.5 min; the playbook and
//     the base): the middle first and leaving home without armour; snowballs and eggs at a foe on narrow ground, the bow
//     once the middle is decided; throws led ahead of a moving target; no looting with the foe within 12 blocks, and
//     holding the wide middle. Practice: won 1 of 3.
//   - Game 1 (DS-Low north): both in the middle by g 14 (DS-Max: diamond sword; DS-Low: four armour pieces); DS-Max's
//     arrow hits DS-Low at g 20.2, it falls and pearls back at g 21.5; golden apples by g 31; the duel from g 35.3: DS-Low
//     hits for 3.7, DS-Max for 2.42 (four armour pieces against three); DS-Max pearls at g 48.2; slain at g 50.82 (0:47).
//   - Game 2 (DS-Max north): DS-Low in the middle first (diamond helmet, iron chestplate and leggings, diamond boots by
//     g 15); DS-Max with a diamond sword, a diamond helmet and boots, and leather between; arrows knock DS-Low off at
//     g 18.7 and g 26.6, a pearl back each time (g 20.0, 27.9); the duel from g 33.1: DS-Low 5.17 a hit, DS-Max 2.28;
//     DS-Low down to 6.56; DS-Max slain at g 45.79 (0:42).
//   - Game 3 (DS-Low north): DS-Max in the middle first (diamond and iron, a diamond sword by g 15); DS-Low with a stone
//     axe and iron leggings takes its own sub-mid and the east one; eggs hit it at g 15.7 and g 29.8; it falls and pearls
//     at g 31.2, a diamond sword at g 32; it waits on the lower ground ("holding for DS-Max on the bridge"), DS-Max takes
//     three light blows (g 39.1-41.0), walks off the rim at g 41.7 and is "knocked into the void by DS-Low" at g 43.12 (0:40).
import { COMMENTATORS } from './arenaDuelEdit.js';

export { COMMENTATORS };

const g1 = { game: 1, matchLabel: 'GAME 1 OF 3' }, g2 = { game: 2, matchLabel: 'GAME 2 OF 3' }, g3 = { game: 3, matchLabel: 'GAME 3 OF 3' };
const overview = { type: 'aerial', at: [0, 29, 0], dist: 52, height: 36, spin: .3 };

export const DS_LOW_VS_MAX_EDIT = {
  id: 'arena-series-ds-low-vs-max',
  title: 'Scripted Arena: DeepSeek low vs max',
  data: '/cinema-arena-duel/ds-low-vs-max',
  fps: 30,
  posterTime: 22,
  header: 'DS-LOW  vs  DS-MAX  ·  DEEPSEEK V4.1 FLASH  ·  SKYWARS',
  matchLabel: 'SKYWARS',
  teamLabels: { Blue: 'DS-LOW', Red: 'DS-MAX' },
  winnerTeam: 'Blue',
  kickoffScene: ['Game 1: the race to the middle', 'Game 2: DS-Low takes the middle', 'Game 3: DS-Max wins the race'],
  finalScene: ['Game 1: the duel', 'Game 2: the duel', 'Game 3: into the void'],
  scenes: [
    // --- cold open ---
    { name: 'Highlight: the last blow', ...g2, dur: 4.5, g: [44.3, 46.1], cam: { type: 'pair', a: 'DS-Low', b: 'DS-Max', angle: 1.2, rise: .5 }, mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h1', who: 'pbp', at: .2, text: 'One model. Two effort settings. Two bots. Three games!', act: 'opening the show, huge energy' }] },

    // --- the line-up, the task, the map ---
    { name: 'Line-ups', ...g1, dur: 17, g: [0, 3], cam: { ...overview, angle: 2.2 }, mood: 'calm', tag: 'PRE-GAME',
      card: { lineup: true, title: 'SCRIPTED ARENA', sub: 'each agent writes its own SkyWars bot · then the bots play · three games' },
      narrate: [
        { id: 'n01', who: 'pbp', at: .6, text: 'Welcome to the Scripted Arena! The same model twice: DeepSeek V4.1 Flash on low effort, against itself on max effort!', act: 'stadium announcer energy, names punched out' },
        { id: 'n02', who: 'color', at: 10.3, text: 'And no AI plays live today. Each one wrote a bot before the games, and the bot plays alone.' },
      ] },
    { name: 'Before the games', ...g1, dur: 11, g: [0, 3], cam: { ...overview, angle: .6 }, mood: 'calm', tag: 'PRE-GAME',
      card: { title: 'BEFORE THE GAMES', sub: 'Each agent got the rule book, this map, and the scripted bot to start from, free to change anything in it. 45 minutes, a check that keeps the game\'s limits, and three practice games against the starting bot.' },
      narrate: [{ id: 'n03', who: 'color', at: .5, text: 'Each got the rule book, this exact map, and a working bot to start from. Forty-five minutes, three practice games, then hands off.' }] },
    { name: 'The map', ...g1, dur: 10, g: [0, 3], cam: { type: 'aerial', at: [0, 28, 0], dist: 46, height: 30, spin: .35, angle: 1.2 }, mood: 'calm', tag: 'PRE-GAME',
      narrate: [{ id: 'n04', who: 'pbp', at: .4, text: 'The map: Sub-Mid Cross. Two spawns face each other down one line, a small island in each lane, and four chests in the middle with the diamond gear.' }] },

    // --- the two bots ---
    { name: 'DS-Low\'s bot', ...g1, dur: 17, g: [0, 3], cam: { type: 'face', who: 'DS-Low', dist: 4, height: 1.8 }, mood: 'calm', tag: 'PRE-GAME',
      card: { profile: 'DS-Low', title: 'DS-LOW\'S BOT', sub: '9 minutes of work  ·  one file changed  ·  practice: won 2 of 3', pointsAt: [1.5, 7, 12],
        points: [
          ['Race to the middle, skip the small island', 'The starting bot stopped at its own sub-mid first. In practice it reached the middle to find all four chests already empty.'],
          ['Only start a crossing it can pay for', 'Blocks in hand against the void ahead, with six to spare; if short, the sub-mid\'s blocks first.'],
          ['Everything else left alone', 'Fighting, eating, bridging and the bow stay exactly as the starting bot plays them.'],
        ] },
      narrate: [
        { id: 'n05', who: 'color', at: 1, text: 'DS-Low worked for nine minutes and changed one thing: skip the small island, race straight for the middle.' },
        { id: 'n06', who: 'pbp', at: 8.4, text: 'Because whoever opens the middle chests first takes the lot!' },
        { id: 'n07', who: 'color', at: 13, text: 'The rest it trusted, as it was.' },
      ] },
    { name: 'DS-Max\'s bot', ...g1, dur: 22, g: [0, 3], cam: { type: 'face', who: 'DS-Max', dist: 4, height: 1.8 }, mood: 'calm', tag: 'PRE-GAME',
      card: { profile: 'DS-Max', title: 'DS-MAX\'S BOT', sub: '19.5 minutes of work  ·  two files changed  ·  practice: won 1 of 3', pointsAt: [1.5, 6.5, 11.5, 16],
        points: [
          ['Middle first, and leave home without armour', 'On this map the middle is the armour, so it stopped waiting for armour from its own chests.'],
          ['Projectiles before the sword', 'Snowballs and eggs at a foe on a narrow bridge; the bow once the middle is decided.'],
          ['Throws that lead a moving target', 'A change to the bot\'s own aiming: a throw goes where the runner will be.'],
          ['No looting near the foe; hold the wide middle', 'No chest with the foe within 12 blocks, and no fight on a one-wide bridge.'],
        ] },
      narrate: [
        { id: 'n08', who: 'color', at: .8, text: 'DS-Max took twenty minutes, and went further. The middle first as well, and no waiting for armour.' },
        { id: 'n09', who: 'pbp', at: 7.4, text: 'Then a plan to knock its rival off the bridges: snowballs, eggs and arrows, aimed ahead of the runner!' },
        { id: 'n10', who: 'color', at: 16.6, text: 'Its record in practice? One win in three.' },
      ] },

    // --- game 1 ---
    { name: 'Game 1', ...g1, dur: 5, g: [0, 3], cam: { ...overview, angle: 0 }, mood: 'tense', tag: 'PRE-GAME',
      card: { title: 'GAME 1', sub: 'DS-Low starts north  ·  DS-Max starts south' },
      narrate: [{ id: 'n11', who: 'pbp', at: .6, text: 'Game one!' }] },
    { name: 'Game 1: the race to the middle', ...g1, dur: 11, g: [2.6, 14.6], cam: { type: 'aerial', at: [0, 30, 0], dist: 40, height: 28, spin: .1, angle: 1.57 }, mood: 'tense', tag: 'LIVE',
      narrate: [
        { id: 'n12', who: 'pbp', at: .3, text: 'The cages open, and both bots take the same line: straight for the middle!' },
        { id: 'n13', who: 'color', atG: 11.8, text: 'A dead heat! DS-Max grabs the diamond sword, DS-Low the fuller armour.' },
      ] },
    // The shots are shown from behind the shooter, then on the target: DS-Max draws from g 18.8 and looses at g 19.78;
    // the arrow lands at g 20.18, DS-Low falls, and its pearl (thrown g 21.12) lands at g 21.47.
    { name: 'Game 1: the bow', ...g1, dur: 4, g: [18.6, 20.4], cam: { type: 'over', who: 'DS-Max', at: 'DS-Low' }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n14', who: 'pbp', at: 3.1, text: 'An arrow from DS-Max knocks DS-Low off the edge, and an ender pearl brings it right back!' }] },
    { name: 'Game 1: the pearl', ...g1, dur: 4.5, g: [20.3, 22.6], cam: { type: 'shot', who: 'DS-Low', item: 'ender_pearl' }, mood: 'tense', tag: 'LIVE' },
    { name: 'Game 1: apples', ...g1, dur: 7, g: [23, 34.6], cam: { type: 'aerial', at: [2, 30, 6], dist: 30, height: 22, spin: .2, angle: .9 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n15', who: 'color', at: 3.5, text: 'Both eat golden apples, and walk into the middle.' }] },
    { name: 'Game 1: the duel', ...g1, dur: 18, g: [34.6, 51.6], cam: { type: 'pair', a: 'DS-Low', b: 'DS-Max', angle: .8 }, mood: 'battle', tag: 'LIVE',
      captions: [{ at: .2, dur: 17.6, kind: 'versus', a: 'DS-Low', b: 'DS-Max' }],
      narrate: [
        { id: 'n16', who: 'pbp', at: .2, text: 'Diamond sword against diamond sword!', act: 'maximum tension' },
        { id: 'n17', who: 'color', atG: 40.3, text: 'DS-Low hits for three point seven, DS-Max for two point four. Four armour pieces against three!' },
        { id: 'n18', who: 'pbp', atG: 46.9, text: 'A pearl! DS-Low follows!' },
        { id: 'n19', who: 'pbp', atG: 50.85, text: 'DS-Max is down! Game one to DS-Low!', act: 'the winning call: scream it with joy' },
      ] },
    { name: 'Game 1: result', ...g1, dur: 5, g: [51.6, 55.4], cam: { ...overview, angle: 1 }, mood: 'victory', tag: 'FULL TIME',
      card: { title: 'DS-LOW WINS GAME 1', sub: 'DS-Max slain at 0:47  ·  DS-Low leads 1–0' } },

    // --- game 2 ---
    { name: 'Game 2', ...g2, dur: 5, g: [0, 3], cam: { ...overview, angle: Math.PI }, mood: 'tense', tag: 'PRE-GAME',
      card: { title: 'GAME 2', sub: 'They swap ends: DS-Max starts north  ·  DS-Low leads 1–0' },
      narrate: [{ id: 'n20', who: 'pbp', at: .6, text: 'Game two! They swap ends.' }] },
    { name: 'Game 2: DS-Low takes the middle', ...g2, dur: 10, g: [2.6, 15.6], cam: { type: 'follow', who: 'DS-Low', dist: 7, height: 4.5 }, mood: 'tense', tag: 'LIVE',
      narrate: [
        { id: 'n21', who: 'pbp', at: .3, text: 'DS-Low runs the lane again, and this time it is first!' },
        { id: 'n22', who: 'color', atG: 9.8, text: 'Diamond and iron for DS-Low. DS-Max gets the sword, in leather.' },
      ] },
    // Arrows loosed at g 18.31 (lands 18.71 on DS-Low; its pearl lands 20.01) and g 26.35 (lands 26.6; pearl 27.85).
    { name: 'Game 2: the bow', ...g2, dur: 3.5, g: [17.3, 18.9], cam: { type: 'over', who: 'DS-Max', at: 'DS-Low' }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n23', who: 'pbp', at: .8, text: 'DS-Max\'s bow again! DS-Low falls, and pearls back!' }] },
    { name: 'Game 2: knocked off', ...g2, dur: 4, g: [18.9, 21], cam: { type: 'shot', who: 'DS-Low', item: 'ender_pearl' }, mood: 'tense', tag: 'LIVE' },
    { name: 'Game 2: the bow again', ...g2, dur: 3.5, g: [25.4, 26.8], cam: { type: 'over', who: 'DS-Max', at: 'DS-Low' }, mood: 'tense', tag: 'LIVE' },
    { name: 'Game 2: saved again', ...g2, dur: 4, g: [26.8, 29.2], cam: { type: 'shot', who: 'DS-Low', item: 'ender_pearl' }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n24', who: 'color', atG: 27.9, text: 'Twice knocked off, twice saved by a pearl!' }] },
    { name: 'Game 2: the duel', ...g2, dur: 16, g: [30.4, 46.6], cam: { type: 'pair', a: 'DS-Low', b: 'DS-Max', angle: 2.2 }, mood: 'battle', tag: 'LIVE',
      captions: [{ at: .2, dur: 15.6, kind: 'versus', a: 'DS-Low', b: 'DS-Max' }],
      narrate: [
        { id: 'n25', who: 'pbp', at: 2.2, text: 'Now the swords!', act: 'maximum tension' },
        { id: 'n26', who: 'color', atG: 34.6, text: 'DS-Low hits for five, DS-Max for two. That is the armour from the middle.' },
        { id: 'n27', who: 'pbp', atG: 41.8, text: 'But DS-Low is down to six health!' },
        { id: 'n28', who: 'pbp', atG: 45.8, text: 'DS-Max falls! Game two to DS-Low!', act: 'the winning call: scream it with joy' },
      ] },
    { name: 'Game 2: replay', ...g2, dur: 8, g: [32.6, 35.4], cam: { type: 'pair', a: 'DS-Low', b: 'DS-Max', angle: 3.6, rise: 1.1 }, mood: 'tense', tag: 'REPLAY',
      narrate: [{ id: 'n29', who: 'color', at: 3.2, text: 'The swords are the same. The armour is not: DS-Max is fighting in a leather tunic.', act: 'the key insight, delivered fast and clear' }] },
    { name: 'Game 2: result', ...g2, dur: 5, g: [46.6, 50.6], cam: { ...overview, angle: 2 }, mood: 'victory', tag: 'FULL TIME',
      card: { title: 'DS-LOW WINS GAME 2', sub: 'DS-Max slain at 0:42  ·  DS-Low leads 2–0' } },

    // --- game 3 ---
    { name: 'Game 3', ...g3, dur: 5, g: [0, 3], cam: { ...overview, angle: .3 }, mood: 'tense', tag: 'PRE-GAME',
      card: { title: 'GAME 3', sub: 'DS-Low starts north  ·  DS-Max plays for pride' },
      narrate: [{ id: 'n30', who: 'pbp', at: .6, text: 'Game three. DS-Max plays for pride!' }] },
    { name: 'Game 3: DS-Max wins the race', ...g3, dur: 9, g: [2.6, 14.6], cam: { type: 'follow', who: 'DS-Max', dist: 7, height: 4.5 }, mood: 'tense', tag: 'LIVE',
      narrate: [
        { id: 'n31', who: 'pbp', at: .3, text: 'And this time DS-Max is first to the middle!' },
        { id: 'n32', who: 'color', atG: 12.4, text: 'Diamond and iron, a diamond sword. DS-Low has a stone axe and one iron piece.' },
      ] },
    // Eggs thrown at g 15.0 (lands 15.7 on DS-Low) and g 29.4 (lands 29.75); DS-Low's pearl lands 31.18, a sword at 32.
    { name: 'Game 3: eggs', ...g3, dur: 4, g: [14.6, 16.2], cam: { type: 'over', who: 'DS-Max', at: 'DS-Low' }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n33', who: 'color', at: 4.2, text: 'DS-Low gears up on the small islands instead, while DS-Max throws eggs at it.' }] },
    { name: 'Game 3: DS-Low gears up', ...g3, dur: 5, g: [16.2, 28.8], cam: { type: 'follow', who: 'DS-Low', dist: 7.5, height: 4.5 }, mood: 'tense', tag: 'LIVE' },
    { name: 'Game 3: another egg', ...g3, dur: 2.5, g: [28.9, 29.9], cam: { type: 'over', who: 'DS-Max', at: 'DS-Low' }, mood: 'tense', tag: 'LIVE' },
    { name: 'Game 3: a pearl and a sword', ...g3, dur: 4.5, g: [29.9, 33.4], cam: { type: 'shot', who: 'DS-Low', item: 'ender_pearl' }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n34', who: 'pbp', atG: 30.6, text: 'DS-Low slips, a pearl, and now a diamond sword!' }] },
    { name: 'Game 3: the edge', ...g3, dur: 10, g: [33.4, 41.4], cam: { type: 'pair', a: 'DS-Low', b: 'DS-Max', angle: 1.9, rise: .6 }, mood: 'battle', tag: 'LIVE',
      captions: [{ at: .2, dur: 9.8, kind: 'versus', a: 'DS-Low', b: 'DS-Max' }],
      narrate: [{ id: 'n35', who: 'color', at: 2.9, text: 'DS-Low waits on the lower ground under the rim. DS-Max comes for it.' }] },
    // DS-Max steps off the middle's north-east rim at about (5.7, -6.5) at g 41.7 and falls straight down: a fixed lens
    // outside the rim watches the fall (a camera on the pair followed it under the island).
    { name: 'Game 3: into the void', ...g3, dur: 4, g: [41.4, 44.2], cam: { from: [16, 26, -14], at: [5.7, 17, -6.5], fov: 66 }, mood: 'battle', tag: 'LIVE',
      narrate: [{ id: 'n36', who: 'pbp', atG: 41.5, text: 'And DS-Max steps off the edge! Into the void! DS-Low sweeps the series!', act: 'the winning call: scream it with joy' }] },
    { name: 'Game 3: replay', ...g3, dur: 9, g: [39, 43.1], cam: { from: [12, 37, -15], at: [4.5, 29, -4], fov: 55 }, mood: 'tense', tag: 'REPLAY',
      narrate: [{ id: 'n37', who: 'color', at: 3.5, text: 'A few light blows from below, DS-Max chasing to the rim, and one step too many.', act: 'the key insight, delivered fast and clear' }] },

    // --- the series ---
    { name: 'DS-Low wins the series', ...g3, dur: 12, g: [44.2, 48], cam: { ...overview, angle: 1.6 }, mood: 'victory', tag: 'FULL TIME',
      card: { result: true, over: 'THE SERIES', title: 'DS-LOW WINS 3–0', sub: 'DeepSeek V4.1 Flash on low effort, against itself on max effort', winnerTeam: 'Blue', statsTitle: 'GAME BY GAME',
        stats: ['Game 1 and Game 2: DS-Max slain in the duel', 'Game 3: DS-Max off the edge, into the void', 'DS-Low: 9 minutes, one change  ·  DS-Max: 19.5 minutes, two files'] },
      narrate: [
        { id: 'n38', who: 'pbp', at: .6, text: 'DS-Low wins it, three games to nil!', act: 'triumphant' },
        { id: 'n39', who: 'color', at: 4.6, text: 'Less effort, one simple change, and a clean sweep.' },
      ] },
    { name: 'What made the difference', ...g3, dur: 15, g: [44.2, 48], cam: { ...overview, angle: 3.2, dist: 44, height: 28 }, mood: 'calm', tag: 'FULL TIME',
      card: { title: 'WHAT MADE THE DIFFERENCE', sub: 'Both bots raced for the middle. DS-Low kept everything else the starting bot did well. DS-Max left home without armour and planned to win from range; when the swords met, it wore less armour.' },
      narrate: [
        { id: 'n40', who: 'color', at: .5, text: 'Both bots raced for the middle. DS-Low kept everything else the starting bot already did well.' },
        { id: 'n41', who: 'color', at: 7.2, text: 'DS-Max left home without armour, and planned to win from range. When the swords met, it wore less armour.' },
      ] },
  ],
};

// ds-unseen-5maps: agentArena/runs/ds-unseen-5maps -- the same two agents (DeepSeek V4.1 Flash, low and max effort), now
// given the rules but no map: five games on five maps they never saw, each more complex than the last (classic,
// sectors, archipelago, twin_peaks, tiers; packs and seeds drawn after the bots were frozen). Checked against the
// series recording (public/cinema-arena-duel/ds-unseen-5maps), each game's recording/events.jsonl and the bots' notes:
//   - DS-Low (22.8 min; the playbook, a new pillar-up skill, four test files; practice: 1 win in 5): reads each map from
//     the places and chests it sees; height-aware looting; no crossing without the blocks (+3); off a one-wide bridge
//     with the foe within 14; the bow from wide ground at 8-30, snowballs at a foe on narrow ground.
//     DS-Max (12.9 min; the playbook only, its fight untouched; practice: 1 win in 4, the win before its changes): sorts
//     chests into mine, theirs and the middle's from the live map; the crossing cost to the chest it picked (+4); a
//     bonus for a real middle chest; drops a chest it cannot reach for 45 s.
//   - Game 1 (classic, DS-Low north): both in the middle by g 12; DS-Low's arrow hits at g 14.09 (4.23); the duel from
//     g 16.9: DS-Low 4.94 a hit, DS-Max 3.88 (four armour pieces against three); DS-Max slain at g 38.68 (0:35).
//   - Game 2 (sectors, DS-Max first): DS-Low's snowball (thrown g 16.34 from 16 blocks) hits DS-Max looting at the
//     middle's edge (g 16.94); DS-Max falls; knocked into the void at g 19.21 (0:16).
//   - Game 3 (archipelago, DS-Low first): DS-Low straight to the middle (diamond and iron by g 16); DS-Max round by the
//     connector islands (leather, a diamond helmet at g 22); arrows hit at g 33.47 (6.99) and 41.23; the duel from
//     g 42.9: DS-Low 7.34 a hit, DS-Max 2.55; slain at g 51.73 (0:48).
//   - Game 4 (twin_peaks, DS-Max first): DS-Low up the high peak (y 33, diamond sword by g 14); its arrows from the peak
//     hit at g 18.87, 23.89, 27.87; DS-Max pearls back (g 20.17, 29.22) and snowballs DS-Low twice; DS-Low comes down
//     (g 38), pearls twice (5 each); its snowball (g 46.20) hits DS-Max on the way up to a peak chest at (16, 35, -2);
//     knocked into the void at g 48.57 (0:45).
//   - Game 5 (tiers, DS-Low first): DS-Max climbs the tower's staircase (y 33-36) to the high chests; DS-Low's arrows
//     from below hit at g 18.88 (6.29) and 31.59; the fight from g 61 on the low steps (y 28) under the tower: DS-Max
//     "holding below DS-Low", its sword 1.88-3.53 a hit; DS-Low pearls at g 60.88 and 66.04 (5 each); at 4.54 health it
//     falls again and pearls back (g 69.55): the landing's 5 kills it (g 69.80, 1:06; the game credits DS-Max).
const u1 = { game: 1, matchLabel: 'GAME 1 OF 5' }, u2 = { game: 2, matchLabel: 'GAME 2 OF 5' }, u3 = { game: 3, matchLabel: 'GAME 3 OF 5' },
  u4 = { game: 4, matchLabel: 'GAME 4 OF 5' }, u5 = { game: 5, matchLabel: 'GAME 5 OF 5' };
const over = (who, at) => ({ type: 'over', who, at }), shot = (who, item) => ({ type: 'shot', who, item });

export const DS_UNSEEN_EDIT = {
  id: 'arena-series-ds-unseen-5maps',
  title: 'Scripted Arena: five unseen maps',
  data: '/cinema-arena-duel/ds-unseen-5maps',
  fps: 30,
  posterTime: 30,
  header: 'DS-LOW  vs  DS-MAX  ·  FIVE UNSEEN MAPS  ·  SKYWARS',
  matchLabel: 'SKYWARS',
  teamLabels: { Blue: 'DS-LOW', Red: 'DS-MAX' },
  winnerTeam: 'Blue',
  kickoffScene: ['Game 1: the race', 'Game 2: the race', 'Game 3: two routes', 'Game 4: up the high peak', 'Game 5: up the tower'],
  finalScene: ['Game 1: the duel', 'Game 2: into the void', 'Game 3: the duel', 'Game 4: into the void', 'Game 5: the fight'],
  scenes: [
    // --- cold open ---
    { name: 'Highlight: one snowball', ...u2, dur: 5, g: [16.2, 18.4], cam: shot('DS-Low', 'snowball'), mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h1', who: 'pbp', at: .3, text: 'Five maps nobody had seen. Two bots. One snowball!', act: 'opening the show, huge energy' }] },

    // --- the line-up and the twist ---
    { name: 'Line-ups', ...u1, dur: 16, g: [0, 3], cam: { ...overview, angle: 2.2 }, mood: 'calm', tag: 'PRE-GAME',
      card: { lineup: true, title: 'SCRIPTED ARENA', sub: 'five games · five maps nobody has seen · each harder than the last' },
      narrate: [
        { id: 'n01', who: 'pbp', at: .6, text: 'Welcome back to the Scripted Arena! DeepSeek V4.1 Flash on low effort, against itself on max effort, the rematch!', act: 'stadium announcer energy, names punched out' },
        { id: 'n02', who: 'color', at: 9.6, text: 'Last time they knew the map. This time, they do not.' },
      ] },
    { name: 'No map in advance', ...u1, dur: 13, g: [0, 3], cam: { ...overview, angle: .6 }, mood: 'calm', tag: 'PRE-GAME',
      card: { title: 'NO MAP IN ADVANCE', sub: 'The agents got the rules and the scripted bot to start from, but no map: five games, each on a new map, each more complex than the last. They wrote their bots, tested them however they liked, and then the bots played alone.' },
      narrate: [{ id: 'n03', who: 'color', at: .5, text: 'They got the rules and a working bot, but no map. Five games, a new map each time, each harder than the last. Their bots have to read every map on their own.' }] },

    // --- the two bots ---
    { name: 'DS-Low\'s bot', ...u1, dur: 24, g: [0, 3], cam: { type: 'face', who: 'DS-Low', dist: 4, height: 1.8 }, mood: 'calm', tag: 'PRE-GAME',
      card: { profile: 'DS-Low', title: 'DS-LOW\'S BOT', sub: '23 minutes  ·  the strategy, a new skill, four test files  ·  practice: won 1 of 5', pointsAt: [1.5, 7, 12, 16.5],
        points: [
          ['Read every map from what it sees', 'Its own island, every middle and connector chest, the foe\'s island: from the game\'s list of places, not a fixed middle.'],
          ['Climb to a chest, or step down to it', 'Chests at its own height first; a new skill to pillar up to one above; climbing down to one below.'],
          ['Never start a crossing it cannot finish', 'Blocks in hand against the void ahead, with three to spare.'],
          ['Keep off narrow bridges near the foe', 'Back to wide ground with the foe close; the bow from wide ground; snowballs at a foe on a narrow path.'],
        ] },
      narrate: [
        { id: 'n04', who: 'color', at: 1, text: 'DS-Low spent twenty-three minutes. It taught its bot to read any map, and to climb to a chest or step down to it.' },
        { id: 'n05', who: 'pbp', at: 12.4, text: 'And one rule from a practice loss: never be caught on a narrow bridge, and catch the other bot on one!' },
      ] },
    { name: 'DS-Max\'s bot', ...u1, dur: 21, g: [0, 3], cam: { type: 'face', who: 'DS-Max', dist: 4, height: 1.8 }, mood: 'calm', tag: 'PRE-GAME',
      card: { profile: 'DS-Max', title: 'DS-MAX\'S BOT', sub: '13 minutes  ·  the strategy only  ·  practice: won 1 of 4 (before its changes)', pointsAt: [1.5, 6, 10.5, 15],
        points: [
          ['Read every map from what it sees', 'Chests sorted into mine, theirs and the middle\'s, from the live map.'],
          ['Count the bridge to the chest it picked', 'The void to cross and the climb, with four blocks to spare.'],
          ['Prefer the real middle chests', 'A bonus for a middle chest; a chest it cannot reach is dropped for 45 seconds.'],
          ['The fight left as it was', 'Its fighting, bow and throws: exactly the scripted bot\'s.'],
        ] },
      narrate: [
        { id: 'n06', who: 'color', at: .8, text: 'DS-Max, on max effort, took thirteen minutes this time. Its bot reads the map too, and plans every bridge.' },
        { id: 'n07', who: 'pbp', at: 14.6, text: 'But the fighting? Untouched. Exactly as the starting bot had it.' },
      ] },

    // --- game 1: classic ---
    { name: 'Game 1', ...u1, dur: 5, g: [0, 3], cam: { ...overview, angle: 0 }, mood: 'tense', tag: 'PRE-GAME',
      card: { title: 'GAME 1  ·  CLASSIC RING', sub: 'One ring of islands, one height  ·  DS-Low starts north' },
      narrate: [{ id: 'n08', who: 'pbp', at: .6, text: 'Game one: the classic ring.' }] },
    { name: 'Game 1: the race', ...u1, dur: 8, g: [2.6, 12.6], cam: { type: 'aerial', at: [0, 30, 0], dist: 40, height: 28, spin: .1, angle: 1.57 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n09', who: 'pbp', at: .3, text: 'Both bots straight to the middle, diamonds for both!' }] },
    { name: 'Game 1: the bow', ...u1, dur: 3.5, g: [13.2, 14.6], cam: over('DS-Low', 'DS-Max'), mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n10', who: 'color', at: .3, text: 'DS-Low draws first: an arrow before the swords.' }] },
    { name: 'Game 1: the duel', ...u1, dur: 20, g: [15.6, 39.4], cam: { type: 'pair', a: 'DS-Low', b: 'DS-Max', angle: .8 }, mood: 'battle', tag: 'LIVE',
      captions: [{ at: .2, dur: 19.6, kind: 'versus', a: 'DS-Low', b: 'DS-Max' }],
      narrate: [
        { id: 'n11', who: 'pbp', at: .6, text: 'Diamond sword against diamond sword!', act: 'maximum tension' },
        { id: 'n12', who: 'color', atG: 24, text: 'DS-Low hits for nearly five, DS-Max for under four. Four armour pieces against three, again.' },
        { id: 'n13', who: 'pbp', atG: 38.7, text: 'DS-Max is down! Game one to DS-Low!', act: 'the winning call: scream it with joy' },
      ] },
    { name: 'Game 1: result', ...u1, dur: 4, g: [39.4, 43.4], cam: { ...overview, angle: 1 }, mood: 'victory', tag: 'FULL TIME',
      card: { title: 'DS-LOW WINS GAME 1', sub: 'DS-Max slain at 0:35  ·  DS-Low leads 1–0' } },

    // --- game 2: sectors ---
    { name: 'Game 2', ...u2, dur: 5, g: [0, 3], cam: { ...overview, angle: Math.PI }, mood: 'tense', tag: 'PRE-GAME',
      card: { title: 'GAME 2  ·  SECTORS', sub: 'Slices of islands around a small middle  ·  DS-Max starts north' },
      narrate: [{ id: 'n14', who: 'pbp', at: .6, text: 'Game two: sectors!' }] },
    { name: 'Game 2: the race', ...u2, dur: 8, g: [2.6, 15.6], cam: { type: 'follow', who: 'DS-Max', dist: 7, height: 4.5 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n15', who: 'color', at: .3, text: 'DS-Max reads the slices well: its own chests, then into the middle, full diamond and iron.' }] },
    { name: 'Game 2: the snowball', ...u2, dur: 4, g: [15.6, 17.2], cam: over('DS-Low', 'DS-Max'), mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n16', who: 'pbp', at: .4, text: 'But DS-Low has a snowball, and DS-Max is looting right on the edge!' }] },
    { name: 'Game 2: into the void', ...u2, dur: 5, g: [16.4, 19.6], cam: shot('DS-Low', 'snowball'), mood: 'battle', tag: 'LIVE',
      narrate: [{ id: 'n17', who: 'pbp', atG: 18.4, text: 'Off the edge! Game two to DS-Low!', act: 'the winning call: scream it with joy' }] },
    { name: 'Game 2: replay', ...u2, dur: 7, g: [16.2, 18.6], cam: { type: 'pair', a: 'DS-Low', b: 'DS-Max', angle: 2.6, rise: 1 }, mood: 'tense', tag: 'REPLAY',
      narrate: [{ id: 'n18', who: 'color', at: 1.7, text: 'Sixteen blocks away, one throw. DS-Max had planned every bridge, but not the edge it was standing on.', act: 'the key insight, delivered fast and clear' }] },
    { name: 'Game 2: result', ...u2, dur: 4, g: [19.6, 23.6], cam: { ...overview, angle: 2 }, mood: 'victory', tag: 'FULL TIME',
      card: { title: 'DS-LOW WINS GAME 2', sub: 'DS-Max knocked into the void at 0:16  ·  DS-Low leads 2–0' } },

    // --- game 3: archipelago ---
    { name: 'Game 3', ...u3, dur: 5, g: [0, 3], cam: { ...overview, angle: .3 }, mood: 'tense', tag: 'PRE-GAME',
      card: { title: 'GAME 3  ·  ARCHIPELAGO', sub: 'Small connector islands at four heights  ·  DS-Low starts north' },
      narrate: [{ id: 'n19', who: 'pbp', at: .6, text: 'Game three: the archipelago.' }] },
    { name: 'Game 3: two routes', ...u3, dur: 8, g: [2.6, 22.6], cam: { type: 'aerial', at: [0, 30, 0], dist: 46, height: 34, spin: .15, angle: 1.2 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n20', who: 'color', at: .5, text: 'Two routes: DS-Low straight to the middle, DS-Max the long way round by the little islands, in leather.' }] },
    { name: 'Game 3: the bow', ...u3, dur: 4, g: [32.4, 34], cam: over('DS-Low', 'DS-Max'), mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n21', who: 'pbp', at: .4, text: 'DS-Low\'s bow again: seven damage before a sword is drawn!' }] },
    { name: 'Game 3: the duel', ...u3, dur: 12, g: [41.4, 52.4], cam: { type: 'pair', a: 'DS-Low', b: 'DS-Max', angle: 2.2 }, mood: 'battle', tag: 'LIVE',
      captions: [{ at: .2, dur: 11.6, kind: 'versus', a: 'DS-Low', b: 'DS-Max' }],
      narrate: [
        { id: 'n22', who: 'color', at: 1.1, text: 'Seven a hit against two and a half. The long way round cost DS-Max the middle\'s armour.' },
        { id: 'n23', who: 'pbp', atG: 51.8, text: 'Game three to DS-Low!', act: 'the winning call: scream it with joy' },
      ] },
    { name: 'Game 3: result', ...u3, dur: 4, g: [52.4, 56.4], cam: { ...overview, angle: 2.4 }, mood: 'victory', tag: 'FULL TIME',
      card: { title: 'DS-LOW WINS GAME 3', sub: 'DS-Max slain at 0:48  ·  DS-Low leads 3–0' } },

    // --- game 4: twin peaks ---
    { name: 'Game 4', ...u4, dur: 5, g: [0, 3], cam: { ...overview, angle: 1.4 }, mood: 'tense', tag: 'PRE-GAME',
      card: { title: 'GAME 4  ·  TWIN PEAKS', sub: 'No middle island: a high peak and a low one  ·  DS-Max starts north' },
      narrate: [{ id: 'n24', who: 'pbp', at: .6, text: 'Game four: twin peaks!' }] },
    { name: 'Game 4: up the high peak', ...u4, dur: 7, g: [2.6, 15.6], cam: { type: 'follow', who: 'DS-Low', dist: 7, height: 4.5 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n25', who: 'color', at: .5, text: 'DS-Low climbs the high peak: the best chests, and the high ground.' }] },
    { name: 'Game 4: arrows from the peak', ...u4, dur: 3.5, g: [18, 19.2], cam: over('DS-Low', 'DS-Max'), mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n26', who: 'pbp', at: .3, text: 'Arrows from the peak! DS-Max falls...' }] },
    { name: 'Game 4: a pearl back', ...u4, dur: 4, g: [19.4, 21.4], cam: shot('DS-Max', 'ender_pearl'), mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n27', who: 'pbp', atG: 20.2, text: 'and pearls right back!' }] },
    { name: 'Game 4: the long exchange', ...u4, dur: 7, g: [21.4, 44.4], cam: { type: 'pair', a: 'DS-Low', b: 'DS-Max', angle: 1.6, rise: .7 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n28', who: 'color', at: .4, text: 'Arrows down, snowballs up, more pearls. DS-Low comes down off the peak, to seven health.' }] },
    { name: 'Game 4: the snowball', ...u4, dur: 3.5, g: [45.4, 46.8], cam: over('DS-Low', 'DS-Max'), mood: 'battle', tag: 'LIVE',
      narrate: [{ id: 'n29', who: 'pbp', at: .3, text: 'DS-Max climbs for a peak chest, and DS-Low throws!' }] },
    { name: 'Game 4: into the void', ...u4, dur: 4.5, g: [46.4, 48.9], cam: shot('DS-Low', 'snowball'), mood: 'battle', tag: 'LIVE',
      narrate: [{ id: 'n30', who: 'pbp', atG: 47.6, text: 'Off the path, into the void! Four nil!', act: 'the winning call: scream it with joy' }] },
    { name: 'Game 4: result', ...u4, dur: 4, g: [48.9, 52.9], cam: { ...overview, angle: 2.8 }, mood: 'victory', tag: 'FULL TIME',
      card: { title: 'DS-LOW WINS GAME 4', sub: 'DS-Max knocked into the void at 0:45  ·  DS-Low leads 4–0' } },

    // --- game 5: tiers ---
    { name: 'Game 5', ...u5, dur: 5, g: [0, 3], cam: { ...overview, angle: .9 }, mood: 'tense', tag: 'PRE-GAME',
      card: { title: 'GAME 5  ·  SKY TIERS', sub: 'A tower with a staircase, stepping islands high and low  ·  DS-Low starts north' },
      narrate: [{ id: 'n31', who: 'pbp', at: .6, text: 'Game five, the hardest map: sky tiers.' }] },
    { name: 'Game 5: up the tower', ...u5, dur: 6, g: [6, 28.6], cam: { type: 'follow', who: 'DS-Max', dist: 7.5, height: 5 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n32', who: 'color', at: .4, text: 'DS-Max climbs the tower\'s staircase to the high chests. Its chest planning pays off.' }] },
    { name: 'Game 5: an arrow from below', ...u5, dur: 3.5, g: [18, 19.3], cam: over('DS-Low', 'DS-Max'), mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n33', who: 'pbp', at: .6, text: 'DS-Low shoots from below: six damage!' }] },
    { name: 'Game 5: round the tower', ...u5, dur: 6, g: [28.6, 59], cam: { type: 'aerial', at: [0, 31, 0], dist: 40, height: 26, spin: .4, angle: .4 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n34', who: 'color', at: .4, text: 'Half a minute circling the tower, high and low, until they meet on the low steps.' }] },
    { name: 'Game 5: the fight', ...u5, dur: 13, g: [59, 69.9], cam: { type: 'pair', a: 'DS-Low', b: 'DS-Max', angle: 1.2, rise: .6 }, mood: 'battle', tag: 'LIVE',
      captions: [{ at: .2, dur: 12.6, kind: 'versus', a: 'DS-Low', b: 'DS-Max' }],
      narrate: [
        { id: 'n35', who: 'color', at: .6, text: 'DS-Max waits below, and DS-Low keeps falling off the steps and pearling back.' },
        { id: 'n36', who: 'pbp', atG: 69.75, text: 'DS-Low is down! DS-Max takes game five!', act: 'the winning call: scream it with joy' },
      ] },
    { name: 'Game 5: replay', ...u5, dur: 7, g: [68.8, 70], cam: shot('DS-Low', 'ender_pearl'), mood: 'tense', tag: 'REPLAY',
      narrate: [{ id: 'n37', who: 'color', at: 3.8, text: 'Look closely: at four and a half health, its own pearl\'s landing did the last five.', act: 'the key insight, delivered fast and clear' }] },
    { name: 'Game 5: result', ...u5, dur: 4, g: [70, 74], cam: { ...overview, angle: 3.6 }, mood: 'victory', tag: 'FULL TIME',
      card: { title: 'DS-MAX WINS GAME 5', winnerTeam: 'Red', sub: 'DS-Low down at 1:06, by its own ender pearl  ·  DS-Low wins 4–1' } },

    // --- the series ---
    { name: 'DS-Low wins the series', ...u5, dur: 12, g: [70, 74], cam: { ...overview, angle: 1.6 }, mood: 'victory', tag: 'FULL TIME',
      card: { result: true, over: 'THE SERIES', title: 'DS-LOW WINS 4–1', sub: 'Five maps nobody had seen  ·  DeepSeek V4.1 Flash, low effort against max', winnerTeam: 'Blue', statsTitle: 'GAME BY GAME',
        stats: ['Games 1 and 3: an arrow first, then the better armour', 'Games 2 and 4: one snowball, into the void', 'Game 5: DS-Max, and DS-Low\'s own pearl'] },
      narrate: [
        { id: 'n38', who: 'pbp', at: .6, text: 'DS-Low wins the series, four games to one!', act: 'triumphant' },
        { id: 'n39', who: 'color', at: 4.8, text: 'Low effort beats max effort again, on maps neither had seen.' },
      ] },
    { name: 'What made the difference', ...u5, dur: 16, g: [70, 74], cam: { ...overview, angle: 3.2, dist: 44, height: 28 }, mood: 'calm', tag: 'FULL TIME',
      card: { title: 'WHAT MADE THE DIFFERENCE', sub: 'Both bots learned to read any map. DS-Low also changed how it fights at range: it kept to wide ground, shot from it, and threw at a foe on narrow ground: arrows opened games 1 and 3, a snowball won games 2 and 4. DS-Max left its fighting as it was.' },
      narrate: [
        { id: 'n40', who: 'color', at: .5, text: 'Both bots learned to read any map. The difference was the fighting.' },
        { id: 'n41', who: 'color', at: 5.6, text: 'DS-Low kept to wide ground and fought from range: arrows to open games one and three, a snowball to win games two and four. DS-Max never changed how it fights.' },
      ] },
  ],
};

// ffa5-drops: agentArena/runs/ffa5-drops -- a test of the five-player free-for-all, with the loot the fallen drop: five
// unchanged scripted bots (Ash Blue, Birch Red, Cedar Green, Dune Yellow, Elm Purple), two games on standard maps, an
// 8-minute limit. Checked against the series recording (public/cinema-arena-duel/ffa5-drops):
//   - Game 1 (classic, frozen_peaks; Ash joins first): Ash (iron sword) slays Cedar at g 16.36, whose loot drops at
//     (2, 31, -6); Dune knocks Birch into the void at g 22.13; Ash slays Dune at g 22.95; Ash walks over Cedar's loot at
//     g 26.8 (a bow, arrows, a stone sword, a water bucket, a snowball, blocks); Ash's snowballs (g 23.46, 26.15) and Elm
//     into the void at g 29.06 (0:26). Ash wins.
//   - Game 2 (sectors, volcanic_shards; Birch joins first): Ash knocks Birch into the void at g 14.66; a brawl from g 20:
//     Elm (stone sword, 4.03 a hit) slays Ash at g 28.57, Cedar (diamond sword, 7.73 a hit) slays Dune at g 31.17; Cedar
//     takes Dune's loot at g 32.7 (14 items: two diamond swords, a diamond helmet, a bow...); Cedar (diamond sword) against
//     Elm (stone sword) from g 33.3 to 52.4; Elm knocks Cedar into the void at g 55.37 (0:52), its 30 items with it.
//   - Points (players outlasted): Elm 7, Ash 5, Dune 4, Cedar 3, Birch 1.
const f1 = { game: 1, matchLabel: 'GAME 1 OF 2' }, f2 = { game: 2, matchLabel: 'GAME 2 OF 2' };
const fiveOverview = { type: 'aerial', at: [0, 29, 0], dist: 52, height: 36, spin: .3 };

export const FFA5_DROPS_EDIT = {
  id: 'arena-series-ffa5-drops',
  title: 'Scripted Arena: five-bot test',
  data: '/cinema-arena-duel/ffa5-drops',
  fps: 30,
  posterTime: 8,
  header: 'FIVE SCRIPTED BOTS  ·  FREE-FOR-ALL  ·  SKYWARS',
  matchLabel: 'SKYWARS',
  winnerTeam: 'Purple',
  kickoffScene: ['Game 1: the race', 'Game 2: first blood'],
  finalScene: ['Game 1: the last snowball', 'Game 2: Cedar against Elm'],
  scenes: [
    { name: 'Highlight: the loot', ...f2, dur: 4.5, g: [31.6, 33.4], cam: { type: 'follow', who: 'Cedar', dist: 5.5, height: 3.2 }, mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h1', who: 'pbp', at: .3, text: 'Five bots, one sky, and everything the fallen leave behind!', act: 'opening the show, huge energy' }] },
    { name: 'Line-ups', ...f1, dur: 14, g: [0, 3], cam: { ...fiveOverview, angle: 2.2 }, mood: 'calm', tag: 'PRE-GAME',
      card: { lineup: true, title: 'FIVE-BOT TEST', sub: 'five scripted bots · a free-for-all on every map · two games · eight minutes each' },
      narrate: [
        { id: 'n01', who: 'pbp', at: .6, text: 'A test run of the five-player arena: Ash, Birch, Cedar, Dune and Elm, all the same scripted bot.' },
        { id: 'n02', who: 'color', at: 8.6, text: 'Last one standing wins. And whoever falls on solid ground drops everything.' },
      ] },

    // --- game 1 ---
    { name: 'Game 1', ...f1, dur: 5, g: [0, 3], cam: { ...fiveOverview, angle: 0 }, mood: 'tense', tag: 'PRE-GAME',
      card: { title: 'GAME 1  ·  CLASSIC RING', sub: 'Eight islands around a big middle  ·  five players' },
      narrate: [{ id: 'n03', who: 'pbp', at: .6, text: 'Game one: the classic ring.' }] },
    { name: 'Game 1: the race', ...f1, dur: 7, g: [2.6, 13], cam: { type: 'aerial', at: [0, 30, 0], dist: 42, height: 30, spin: .12, angle: 1.2 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n04', who: 'pbp', at: .3, text: 'Five bots, five bridges, all heading for the middle!' }] },
    { name: 'Game 1: Ash against Cedar', ...f1, dur: 6, g: [12.8, 17.4], cam: { type: 'pair', a: 'Ash', b: 'Cedar', angle: .8 }, mood: 'battle', tag: 'LIVE',
      captions: [{ at: .2, dur: 5.6, kind: 'versus', a: 'Ash', b: 'Cedar' }],
      narrate: [{ id: 'n05', who: 'pbp', atG: 16.4, text: 'Cedar is down first, and its loot hits the floor!' }] },
    { name: 'Game 1: Birch, Dune, Ash', ...f1, dur: 8, g: [17.2, 23.4], cam: { type: 'group', who: ['Birch', 'Dune', 'Ash'], angle: 2.2, rise: .55 }, mood: 'battle', tag: 'LIVE',
      narrate: [
        { id: 'n06', who: 'color', at: 2.5, text: 'Dune knocks Birch into the void...' },
        { id: 'n07', who: 'pbp', atG: 22.9, text: 'and Ash finishes Dune! Three gone!' },
      ] },
    { name: 'Game 1: Ash takes the loot', ...f1, dur: 5, g: [24.6, 27.4], cam: { type: 'follow', who: 'Ash', dist: 5.5, height: 3.2 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n08', who: 'color', at: 2.5, text: 'Ash walks over Cedar\'s loot: a bow, arrows, a sword, a bucket.' }] },
    { name: 'Game 1: the last snowball', ...f1, dur: 6, g: [25.8, 29.6], cam: { type: 'shot', who: 'Ash', item: 'snowball' }, mood: 'battle', tag: 'LIVE',
      narrate: [{ id: 'n09', who: 'pbp', atG: 29.1, text: 'A snowball, and Elm is gone! Ash wins game one!', act: 'the winning call: scream it with joy' }] },
    { name: 'Game 1: result', ...f1, dur: 4, g: [30, 33.8], cam: { ...fiveOverview, angle: 1 }, mood: 'victory', tag: 'FULL TIME',
      card: { title: 'ASH WINS GAME 1', winnerTeam: 'Blue', sub: 'Elm knocked into the void at 0:26  ·  places: Ash, Elm, Dune, Birch, Cedar' } },

    // --- game 2 ---
    { name: 'Game 2', ...f2, dur: 5, g: [0, 3], cam: { ...fiveOverview, angle: Math.PI }, mood: 'tense', tag: 'PRE-GAME',
      card: { title: 'GAME 2  ·  SECTORS', sub: 'Slices of islands around a small middle  ·  the join order turns' },
      narrate: [{ id: 'n10', who: 'pbp', at: .6, text: 'Game two: sectors!' }] },
    { name: 'Game 2: first blood', ...f2, dur: 5, g: [11, 15.2], cam: { type: 'pair', a: 'Ash', b: 'Birch', angle: 1.4 }, mood: 'battle', tag: 'LIVE',
      narrate: [{ id: 'n11', who: 'pbp', at: .4, text: 'Ash knocks Birch into the void. Birch is out first.' }] },
    { name: 'Game 2: the brawl', ...f2, dur: 10, g: [20, 31.6], cam: { type: 'group', who: ['Ash', 'Elm', 'Dune', 'Cedar'], angle: .6, rise: .55 }, mood: 'battle', tag: 'LIVE',
      narrate: [
        { id: 'n12', who: 'color', at: .4, text: 'Four in the middle. Elm slays Ash with a stone sword...' },
        { id: 'n13', who: 'pbp', atG: 31.2, text: 'and Cedar slays Dune!' },
      ] },
    { name: 'Game 2: Cedar takes the loot', ...f2, dur: 5, g: [31.4, 33.4], cam: { type: 'follow', who: 'Cedar', dist: 5.5, height: 3.2 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n14', who: 'color', at: 2.7, text: 'Cedar scoops up Dune\'s loot: two diamond swords and a diamond helmet.' }] },
    { name: 'Game 2: Cedar against Elm', ...f2, dur: 16, g: [33.4, 55.8], cam: { type: 'pair', a: 'Cedar', b: 'Elm', angle: 2.2 }, mood: 'battle', tag: 'LIVE',
      captions: [{ at: .2, dur: 15.6, kind: 'versus', a: 'Cedar', b: 'Elm' }],
      narrate: [
        { id: 'n15', who: 'pbp', at: 2.5, text: 'The last two: Cedar in diamond, Elm with a stone sword!' },
        { id: 'n16', who: 'color', atG: 44, text: 'Twenty seconds of trading blows. The diamond should win this.' },
        { id: 'n17', who: 'pbp', atG: 55.4, text: 'But Elm knocks Cedar off! Elm wins!', act: 'the winning call: scream it with joy' },
      ] },
    { name: 'Game 2: replay', ...f2, dur: 7, g: [51.4, 53.6], cam: { type: 'pair', a: 'Cedar', b: 'Elm', angle: 2.6, rise: .8 }, mood: 'tense', tag: 'REPLAY',
      narrate: [{ id: 'n18', who: 'color', at: 3.4, text: 'Cedar had the better sword and Dune\'s loot. One knock at the edge was all Elm needed.', act: 'the key insight, delivered fast and clear' }] },
    { name: 'Game 2: result', ...f2, dur: 4, g: [56, 60], cam: { ...fiveOverview, angle: 2 }, mood: 'victory', tag: 'FULL TIME',
      card: { title: 'ELM WINS GAME 2', winnerTeam: 'Purple', sub: 'Cedar knocked into the void at 0:52, thirty items with it  ·  places: Elm, Cedar, Dune, Ash, Birch' } },

    // --- the two games together ---
    { name: 'The standings', ...f2, dur: 11, g: [56, 60], cam: { ...fiveOverview, angle: 1.6 }, mood: 'victory', tag: 'FULL TIME',
      card: { result: true, over: 'AFTER TWO GAMES', title: 'ELM LEADS', sub: 'Elm 7 points, from 2nd and 1st', winnerTeam: 'Purple', statsTitle: 'POINTS: PLAYERS OUTLASTED',
        stats: ['Elm 7  ·  Ash 5', 'Dune 4  ·  Cedar 3  ·  Birch 1', 'One win each for Ash and Elm'] },
      narrate: [
        { id: 'n19', who: 'pbp', at: .6, text: 'Elm leads after two games, with seven points!', act: 'triumphant' },
        { id: 'n20', who: 'color', at: 4.6, text: 'Same bot, five times over. Next, the AI agents write their own.' },
      ] },
  ],
};

// five-bots: agentArena/runs/five-bots -- four AI agents (Claude Opus 5.5, GPT-6.1 Sol, Gemini 3.8 Flash, DeepSeek V4.1
// Flash, all at high effort) each wrote a SkyWars bot from the rules and the map generator, with the scripted bot as a
// reference; then all five bots (with the unchanged scripted bot) played five free-for-alls on maps none had seen, each
// more complex. Colours: Opus Blue, Sol Red, Gemini Green, DeepSeek Yellow, Scripted Purple. Checked against the series
// recording (public/cinema-arena-duel/five-bots), each game's recording and the bots' notes:
//   - The bots: Opus (24 min; the playbook rewritten, 7 new skills; practice 4th, 4th, 2nd): chests scored by value
//     against distance, bridging, height and danger; climbs and drops to chests; fights a foe within 5.5 or one that hit
//     it; a third party: keeps out of reach of two who fight and shoots them; hunts from 4:30. Sol (40.5 min; a new
//     playbook, A* routes over the terrain it sees, 53 tests; practice 5th, survived, 4th, 5th, won): fights attackers
//     and wounded loners, avoids contested chests, retreats to wide ground, builds a backstop on bridges, digs out of a
//     box. Gemini (45 min, the whole time; practice 5th, won): "the vulture" -- when two fight, stay just out of reach,
//     harass with snowballs and the bow, then strike the weakened survivor; never between two foes; take the fallen's
//     gear. DeepSeek (35 min; the playbook rewritten; practice 3rd, 2nd, 3rd): a block budget for every crossing, routes
//     through connector islands, commits to one chest, finishes its own island first.
//   - Game 1 (classic, frozen_peaks; Opus joins first): DeepSeek's snowball (g 9.8) and Opus into the void (g 12.6);
//     Scripted (diamond sword) slays DeepSeek (g 19.2) and takes its loot (g 20, 7 items); Sol (stone sword, 8 hits, 15)
//     against Scripted (diamond, 4 hits, 34.5) from g 16, Sol slain at g 33.5; Gemini's snowball (g 40.6) draws Scripted onto a
//     bridge toward Gemini, whose sword (a sprint hit, not logged) knocks it off at g 43.8; the void at g 45.7 (0:42). Gemini wins.
//   - Game 2 (sectors, volcanic_shards; Sol first): Opus knocks DeepSeek into the void (g 18.4); Opus's bow (3 hits, 22)
//     and Sol slain (g 29.7); Gemini's snowballs at Opus (g 43.3, 49.6); Gemini (iron sword, 24.8) against Opus (diamond,
//     23) g 60-68, Opus slain at g 68.5; Gemini's snowball (g 68.8), Scripted into the void at g 72.5 (1:09); Gemini takes
//     Opus's loot (g 70, 14 items: a diamond sword, a bow...). Gemini wins.
//   - Game 3 (archipelago, sky_ruins; Gemini first): Opus knocks Sol (g 30.9) and Scripted (g 39.1) into the void;
//     Gemini's arrows hit Opus at g 37.9, 46.0, 112.2, 116.6; the arrow at 116.6 knocks Opus off its island; it pearls back
//     (g 118.2), falls into a hollow under the middle (y 21) at 4 health; Gemini pearls in (g 122.5) and knocks it out the
//     open side (-z) into the void at g 125.8; Gemini stays in the hollow, DeepSeek above it; neither reaches the other; time (8:00): Gemini
//     and DeepSeek share first.
//   - Game 4 (twin_peaks, meadow; DeepSeek first): eggs between DeepSeek and Gemini (g 8.7-12.3), DeepSeek into the void
//     (g 14.9); Opus knocks Scripted (g 26.3), Sol (g 38.1) and Gemini (g 62.7, 1:00) into the void. Opus wins.
//   - Game 5 (tiers, end_citadel; Scripted first): DeepSeek knocks Scripted into the void (g 29.9); Opus's bow and Gemini
//     into the void (g 39.5); Opus against Sol (g 49-61), Sol's eggs (g 50.5, 78.3); Opus falls, pearls twice (g 60.0,
//     61.8) and lands in a hollow under the middle (y 22) at 3 health; heals and stays; Sol slays DeepSeek at g 346.2
//     (5:43) and takes its loot; time (8:00): Opus and Sol share first.
//   - Points (players outlasted): Gemini 15 (2 wins), Opus 11 (1 win), Sol 8, Scripted 8, DeepSeek 6.
const v1 = { game: 1, matchLabel: 'GAME 1 OF 5' }, v2 = { game: 2, matchLabel: 'GAME 2 OF 5' }, v3 = { game: 3, matchLabel: 'GAME 3 OF 5' },
  v4 = { game: 4, matchLabel: 'GAME 4 OF 5' }, v5 = { game: 5, matchLabel: 'GAME 5 OF 5' };
const wide = { type: 'aerial', at: [0, 29, 0], dist: 54, height: 38, spin: .3 };
const ffaShot = (who, item) => ({ type: 'shot', who, item });

export const FIVE_BOTS_EDIT = {
  id: 'arena-series-five-bots',
  title: 'Scripted Arena: five bots',
  data: '/cinema-arena-duel/five-bots',
  fps: 30,
  posterTime: 30,
  header: 'OPUS · SOL · GEMINI · DEEPSEEK · SCRIPTED  ·  SKYWARS FREE-FOR-ALL',
  matchLabel: 'SKYWARS',
  winnerTeam: 'Green',
  kickoffScene: ['Game 1: the race', 'Game 2: the race', 'Game 3: the race', 'Game 4: the race', 'Game 5: the race'],
  finalScene: ['Game 1: the vulture strikes', 'Game 2: the last snowball', 'Game 4: Opus against Gemini'],
  scenes: [
    // --- cold open ---
    { name: 'Highlight: the vulture', ...v1, dur: 5, g: [40.2, 46.2], cam: ffaShot('Gemini', 'snowball'), mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h1', who: 'pbp', at: .3, text: 'Four AI models, four bots, one free-for-all!', act: 'opening the show, huge energy' }] },

    // --- the line-up ---
    { name: 'Line-ups', ...v1, dur: 16, g: [0, 3], cam: { ...wide, angle: 2.2 }, mood: 'calm', tag: 'PRE-GAME',
      card: { lineup: true, title: 'SCRIPTED ARENA', sub: 'four AI agents write a bot each · five free-for-alls · five maps nobody has seen' },
      narrate: [
        { id: 'n01', who: 'pbp', at: .6, text: 'Welcome to the Scripted Arena! Claude Opus, GPT Sol, Gemini Flash and DeepSeek Flash, and the scripted bot they all started from.' },
        { id: 'n02', who: 'color', at: 10.4, text: 'Every game, all five at once. Last one standing wins.' },
      ] },
    { name: 'The rules', ...v1, dur: 15.76, g: [0, 3], cam: { ...wide, angle: .6 }, mood: 'calm', tag: 'PRE-GAME',
      card: { title: 'NO MAP, FIVE PLAYERS', sub: 'Each agent got the rules, the code that builds the maps, and the scripted bot to start from -- but not the maps. Five games, each on a new map, harder each time. Every player scores the players it outlasts.' },
      narrate: [{ id: 'n03', who: 'color', at: .5, text: 'They knew the rules and how maps are built, but not which maps. And they knew they would face four opponents at once.' },
        { id: 'n03b', who: 'pbp', at: 8.4, text: 'And once the games start, nobody can help them: no AI is asked anything while the bots play.' }] },

    // --- the four bots ---
    { name: 'Opus\'s bot', ...v1, dur: 17, g: [0, 3], cam: { type: 'face', who: 'Opus', dist: 4, height: 1.8 }, mood: 'calm', tag: 'PRE-GAME',
      card: { profile: 'Opus', title: 'OPUS\'S BOT', sub: '24 minutes  ·  strategy rewritten, 7 new skills  ·  practice: 4th, 4th, 2nd', pointsAt: [1.5, 6, 10.5],
        points: [
          ['Every chest priced', 'Value against distance, void to bridge, height and danger; climbs and drops to reach one.'],
          ['The third party', 'When two fight, stay out of reach and shoot them; clean up the survivor.'],
          ['Hunt late', 'From 4:30 with good gear, from 6:30 regardless: every player outlasted is a point.'],
        ] },
      narrate: [{ id: 'n04', who: 'color', at: 1, text: 'Opus prices every chest, and plays the third party: let two fight, shoot them, and finish the winner.' },
        { id: 'p04b', who: 'pbp', at: 9, text: 'And it hunts late: from four thirty with good gear, from six thirty with whatever it has.' }] },
    { name: 'Sol\'s bot', ...v1, dur: 17, g: [0, 3], cam: { type: 'face', who: 'Sol', dist: 4, height: 1.8 }, mood: 'calm', tag: 'PRE-GAME',
      card: { profile: 'Sol', title: 'SOL\'S BOT', sub: '40 minutes  ·  new strategy, its own route finder, 53 tests  ·  practice: 5th, survived, 4th, 5th, won', pointsAt: [1.5, 6, 10.5],
        points: [
          ['Its own route finder', 'Paths over the terrain it has seen, with a block budget for every bridge.'],
          ['Fight the right one', 'Whoever attacks it, or a wounded player who is alone; keep away from contested chests.'],
          ['Never caught on a bridge', 'Back to wide ground, or build a wall beside it; dig out if boxed in.'],
        ] },
      narrate: [{ id: 'n05', who: 'color', at: 1, text: 'Sol did the most engineering: its own route finder, fifty-three tests, and five practice games.' },
        { id: 'p05b', who: 'pbp', at: 9, text: 'It never fights on a bridge: back to wide ground, or build a wall beside it.' }] },
    { name: 'Gemini\'s bot', ...v1, dur: 16, g: [0, 3], cam: { type: 'face', who: 'Gemini', dist: 4, height: 1.8 }, mood: 'calm', tag: 'PRE-GAME',
      card: { profile: 'Gemini', title: 'GEMINI\'S BOT', sub: '45 minutes, every one of them  ·  practice: 5th, then a win', pointsAt: [1.5, 6, 10.5],
        points: [
          ['The vulture', 'When two fight, stay just out of reach and harass with snowballs and the bow.'],
          ['Strike the weakened', 'Finish the survivor; never stand between two foes.'],
          ['Take their gear', 'The fallen drop everything: pick it up.'],
        ] },
      narrate: [{ id: 'n06', who: 'pbp', at: 1, text: 'Gemini called its plan the vulture: let them fight, then pick off whoever is left!' },
        { id: 'p06b', who: 'color', at: 8, text: 'It stays out of reach, harasses with snowballs and the bow, and takes the loser\'s gear.' }] },
    { name: 'DeepSeek\'s bot', ...v1, dur: 16, g: [0, 3], cam: { type: 'face', who: 'DeepSeek', dist: 4, height: 1.8 }, mood: 'calm', tag: 'PRE-GAME',
      card: { profile: 'DeepSeek', title: 'DEEPSEEK\'S BOT', sub: '35 minutes  ·  strategy rewritten  ·  practice: 3rd, 2nd, 3rd', pointsAt: [1.5, 6, 10.5],
        points: [
          ['A budget for every bridge', 'Never start a crossing without the blocks to finish it.'],
          ['Route by the islands', 'The cheapest crossing, through connector islands, not the straight line.'],
          ['One chest at a time', 'Commit to a target and finish its own island first.'],
        ] },
      narrate: [{ id: 'n07', who: 'color', at: 1, text: 'DeepSeek built a careful one: a block budget for every bridge, and the cheapest route across.' },
        { id: 'p07b', who: 'pbp', at: 8, text: 'And it commits: one chest at a time, its own island first.' }] },

    // --- game 1 --- (every elimination its own shot, at about real speed)
    { name: 'Game 1', ...v1, dur: 5, g: [0, 3], cam: { ...wide, angle: 0 }, mood: 'tense', tag: 'PRE-GAME',
      card: { title: 'GAME 1  ·  CLASSIC RING', sub: 'One ring of islands around a big middle' },
      narrate: [{ id: 'n08', who: 'pbp', at: .6, text: 'Game one: the classic ring.' }] },
    { name: 'Game 1: the race', ...v1, dur: 4.5, g: [2.6, 8.4], cam: { type: 'aerial', at: [0, 30, 0], dist: 44, height: 30, spin: .12, angle: 1.2 }, mood: 'tense', tag: 'LIVE' ,
      narrate: [{ id: 'r1', who: 'color', at: 0.3, text: 'Five islands, a chest or three each, and the big middle.' }] },
    { name: 'Game 1: Opus off the bridge', ...v1, dur: 6.34, g: [8.4, 13.2], cam: { type: 'pair', a: 'DeepSeek', b: 'Opus', angle: 2.4, rise: .5 }, mood: 'battle', tag: 'LIVE',
      narrate: [
        { id: 'g1a', who: 'pbp', at: .2, text: 'Opus bridges out toward the middle.' },
        { id: 'g1b', who: 'pbp', atG: 10.5, text: 'DeepSeek\'s snowball knocks it off! Opus is out first!' },
      ] },
    { name: 'Game 1: DeepSeek against the diamond sword', ...v1, dur: 7.05, g: [14.2, 20.2], cam: { type: 'pair', a: 'Scripted', b: 'DeepSeek', angle: 1.6, rise: .5 }, mood: 'battle', tag: 'LIVE',
      narrate: [
        { id: 'g1c', who: 'color', at: 0.88, text: 'The scripted bot found a diamond sword in its first chest.' },
        { id: 'g1d', who: 'pbp', atG: 18.2, text: 'Three hits, and DeepSeek is slain!' },
      ] },
    { name: 'Game 1: Sol against the diamond sword', ...v1, dur: 12.5, g: [20.2, 34.4], cam: { type: 'pair', a: 'Sol', b: 'Scripted', angle: 1.2, rise: .5 }, mood: 'battle', tag: 'LIVE',
      captions: [{ at: .2, dur: 12, kind: 'versus', a: 'Sol', b: 'Scripted' }],
      narrate: [
        { id: 'g1e', who: 'pbp', at: 0.76, text: 'Sol takes it on with a stone sword.' },
        { id: 'g1f', who: 'color', atG: 25.2, text: 'Sol lands eight hits, two damage each. A diamond-sword hit does ten.' },
        { id: 'g1g', who: 'pbp', atG: 32.4, text: 'Four of those, and Sol is slain!' },
      ] },
    { name: 'Game 1: the vulture strikes', ...v1, dur: 9.48, g: [38.4, 46.4], cam: { from: [-4, 45, 12], to: [-6, 44, 13], at: [-16.5, 29, 3.5], fov: 50 }, mood: 'battle', tag: 'LIVE',
      narrate: [
        { id: 'g1h', who: 'color', at: 1.46, text: 'Gemini watched all of it. A snowball, and the bot bridges over to it...' },
        { id: 'g1i', who: 'pbp', atG: 44.1, text: 'one hit from Gemini\'s sword, and it is off the bridge! Gemini wins game one!', act: 'the winning call: scream it with joy' },
      ] },
    { name: 'Game 1: replay', ...v1, dur: 6.4, g: [42.8, 45.4], cam: { type: 'over', who: 'Gemini', at: 'Scripted', side: 1.6, height: 2.4 }, mood: 'victory', tag: 'REPLAY',
      narrate: [{ id: 'g1j', who: 'color', at: 2.6, text: 'On a bridge one block wide, one hit is all it takes.' }] },
    { name: 'Game 1: result', ...v1, dur: 4.5, g: [46.4, 50], cam: { ...wide, angle: 1 }, mood: 'victory', tag: 'FULL TIME',
      card: { title: 'GEMINI WINS GAME 1', winnerTeam: 'Green', sub: 'Gemini 4  ·  Scripted 3  ·  Sol 2  ·  DeepSeek 1  ·  Opus 0' } ,
      narrate: [{ id: 'e1', who: 'color', at: 0.3, text: 'Game one to Gemini. The vulture plan, first time out.' }] },

    // --- game 2 ---
    { name: 'Game 2', ...v2, dur: 5, g: [0, 3], cam: { ...wide, angle: Math.PI }, mood: 'tense', tag: 'PRE-GAME',
      card: { title: 'GAME 2  ·  SECTORS', sub: 'Slices of islands around a small middle' },
      narrate: [{ id: 'n14', who: 'pbp', at: 1.4, text: 'Game two: sectors!' }] },
    { name: 'Game 2: the race', ...v2, dur: 4, g: [3, 12], cam: { type: 'aerial', at: [0, 30, 0], dist: 44, height: 30, spin: .12, angle: 2.6 }, mood: 'tense', tag: 'LIVE' ,
      narrate: [{ id: 'r2', who: 'color', at: 0.3, text: 'Everyone loots first. Then the bridges go out.' }] },
    { name: 'Game 2: DeepSeek off the bridge', ...v2, dur: 6.5, g: [12, 19], cam: { type: 'pair', a: 'Opus', b: 'DeepSeek', angle: .6, rise: .5 }, mood: 'battle', tag: 'LIVE',
      narrate: [
        { id: 'g2a', who: 'pbp', at: .3, text: 'DeepSeek bridges straight at Opus.' },
        { id: 'g2b', who: 'pbp', atG: 15.9, text: 'One hit of the diamond sword, and DeepSeek is off the bridge!' },
      ] },
    { name: 'Game 2: Opus against Sol', ...v2, dur: 10, g: [19.5, 30.4], cam: { type: 'pair', a: 'Opus', b: 'Sol', angle: .9, rise: .5 }, mood: 'battle', tag: 'LIVE',
      captions: [{ at: .2, dur: 9.6, kind: 'versus', a: 'Opus', b: 'Sol' }],
      narrate: [
        { id: 'g2c', who: 'pbp', at: 1.61, text: 'Then Opus goes after Sol: an arrow first...' },
        { id: 'g2d', who: 'pbp', atG: 25.7, text: 'then up close. Sol hits back once, and is slain!' },
      ] },
    { name: 'Game 2: snowballs', ...v2, dur: 6.22, g: [42.8, 51.2], cam: ffaShot('Gemini', 'snowball'), mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n17', who: 'pbp', at: 1.3, text: 'Gemini starts on Opus from range: snowball, snowball!' }] },
    { name: 'Game 2: Gemini against Opus', ...v2, dur: 10.5, g: [59.4, 68.7], cam: { type: 'pair', a: 'Gemini', b: 'Opus', angle: 1.2 }, mood: 'battle', tag: 'LIVE',
      captions: [{ at: .2, dur: 10.1, kind: 'versus', a: 'Gemini', b: 'Opus' }],
      narrate: [
        { id: 'g2e', who: 'color', at: .5, text: 'Iron sword against diamond. Opus hits more often, but Gemini hits twice as hard.' },
        { id: 'g2f', who: 'pbp', atG: 67.4, text: 'Opus is slain!' },
      ] },
    { name: 'Game 2: the last snowball', ...v2, dur: 7.73, g: [68.7, 73], cam: ffaShot('Gemini', 'snowball'), mood: 'battle', tag: 'LIVE',
      narrate: [{ id: 'g2g', who: 'pbp', at: 0.54, text: 'A snowball at the scripted bot, on the edge of its island... it falls! Gemini wins again!', act: 'the winning call: scream it with joy' }] },
    { name: 'Game 2: replay', ...v2, dur: 8.26, g: [68.7, 71.8], cam: { type: 'over', who: 'Gemini', at: 'Scripted', side: 1.6, height: 2.6 }, mood: 'victory', tag: 'REPLAY',
      narrate: [{ id: 'g2h', who: 'color', at: 2, text: 'Eighteen blocks, right on target. The bot throws a pearl as it falls, but it is too late.' }] },
    { name: 'Game 2: result', ...v2, dur: 4.5, g: [73, 77], cam: { ...wide, angle: 2 }, mood: 'victory', tag: 'FULL TIME',
      card: { title: 'GEMINI WINS GAME 2', winnerTeam: 'Green', sub: 'Gemini 4  ·  Scripted 3  ·  Opus 2  ·  Sol 1  ·  DeepSeek 0' } ,
      narrate: [{ id: 'e2', who: 'color', at: 0.3, text: 'Two from two for Gemini.' }] },

    // --- game 3 ---
    { name: 'Game 3', ...v3, dur: 5, g: [0, 3], cam: { ...wide, angle: .3 }, mood: 'tense', tag: 'PRE-GAME',
      card: { title: 'GAME 3  ·  ARCHIPELAGO', sub: 'Small connector islands at four heights' },
      narrate: [{ id: 'n21', who: 'pbp', at: .6, text: 'Game three: the archipelago.' }] },
    { name: 'Game 3: the race', ...v3, dur: 4.48, g: [3, 24], cam: { type: 'aerial', at: [0, 28, 0], dist: 44, height: 30, spin: .12, angle: .3 }, mood: 'tense', tag: 'LIVE' ,
      narrate: [{ id: 'r3', who: 'color', at: 0.3, text: 'Small islands at four heights. Every crossing is a risk.' }] },
    { name: 'Game 3: Sol between two swords', ...v3, dur: 9.79, g: [24, 31.4], cam: { type: 'group', who: ['Opus', 'Sol', 'Scripted'], angle: 2.2, rise: .55 }, mood: 'battle', tag: 'LIVE',
      narrate: [
        { id: 'g3a', who: 'pbp', at: .3, text: 'Sol is caught between Opus and the scripted bot, both with diamond swords.' },
        { id: 'g3b', who: 'pbp', atG: 28.6, text: 'Opus hits it last, and Sol goes into the void!' },
      ] },
    { name: 'Game 3: Opus against Scripted', ...v3, dur: 7, g: [32.2, 39.6], cam: { type: 'pair', a: 'Opus', b: 'Scripted', angle: 2.8, rise: .5 }, mood: 'battle', tag: 'LIVE',
      narrate: [
        { id: 'g3c', who: 'pbp', at: 0.52, text: 'Now Opus drives the scripted bot back to the edge.' },
        { id: 'g3d', who: 'pbp', atG: 36.8, text: 'Over it goes! A pearl, but it falls again!' },
      ] },
    { name: 'Game 3: Gemini\'s bow', ...v3, dur: 6.28, g: [39.6, 111.6], cam: { type: 'pair', a: 'Gemini', b: 'Opus', angle: 1.4, rise: .7 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'g3e', who: 'color', at: 0.95, text: 'Three left: Gemini, Opus and DeepSeek, far apart. Gemini gets out its bow.' }] },
    { name: 'Game 3: Opus into the void', ...v3, dur: 15.71, g: [111.6, 126.4], cam: { type: 'pair', a: 'Gemini', b: 'Opus', angle: 1.4, rise: .6 }, mood: 'battle', tag: 'LIVE',
      narrate: [
        { id: 'g3f', who: 'pbp', atG: 112.3, text: 'An arrow into Opus, then another...' },
        { id: 'g3g', who: 'pbp', atG: 117.3, text: 'and Opus falls off its island! It pearls back, but lands in a hollow under the middle, at four health.' },
        { id: 'g3h', who: 'pbp', atG: 123.6, text: 'Gemini pearls in after it, and knocks Opus out!' },
      ] },
    { name: 'Game 3: replay', ...v3, dur: 7.76, g: [121.6, 126], cam: { from: [6.5, 22.6, -15], at: [6.5, 21.6, -3.2], fov: 48 }, mood: 'tense', tag: 'REPLAY',
      narrate: [{ id: 'g3i', who: 'color', at: 1.16, text: 'Inside the hollow: Opus is healing, Gemini drops in, and one push sends Opus out the open side.' }] },
    // The standoff (g 126-483): Gemini on its own blocks in a hollow under the middle's -z rim (y 21, about seven blocks
    // of rock and dirt overhead, open only on the void side); DeepSeek on top (y 31), its log "moving toward Gemini" /
    // "getting off a ledge" / "climbing down (1 blocks)", Gemini's "moving toward DeepSeek" / "getting off a ledge". No
    // block was dug and no hit landed after g 311. Seen from above only DeepSeek shows, so the pins mark both.
    { name: 'Game 3: two left, one in sight', ...v3, dur: 9, g: [126.6, 150], cam: { type: 'aerial', at: [0, 28, 0], dist: 44, height: 30, spin: .15, angle: .8 }, mood: 'tense', tag: 'LIVE',
      standoff: { players: ['Gemini', 'DeepSeek'], at: 3.2, notes: { Gemini: 'UNDER THE ISLAND', DeepSeek: 'ON TOP' } },
      narrate: [{ id: 'g3j', who: 'pbp', at: .4, text: 'Two players left, Gemini and DeepSeek. But from up here, you can only see one of them!' }] },
    // Where Gemini hides, cut open: the slice x = 5 through its spot (z -3.3, y 21) and DeepSeek above (x 3.5, z -0.3,
    // y 31); the trail is Gemini's pearl in after Opus (g 117-127).
    { name: 'Game 3: where Gemini is hiding', ...v3, dur: 23.15, g: [300, 301], cam: { ...wide, angle: 1.1 }, mood: 'tense', tag: 'LIVE',
      card: { title: 'WHERE GEMINI IS HIDING', sub: 'the middle island cut open, seen from the side', slice: { axis: 'x', at: 5, h: [-17, 11], y: [14, 36], players: ['Gemini', 'DeepSeek'],
        gap: '{dy} BLOCKS UP  ·  ROCK BETWEEN',
        notes: [
          { at: 2, text: 'Gemini: on a block it placed itself, tucked under the island', point: [-4, 20], box: [870, 470] },
          { at: 7.5, text: 'Rock and dirt over its head: no way straight up', point: [-3, 26], box: [150, 300] },
          { at: 12.5, text: 'The only way in or out: from this side, over the void', point: [-8, 22], box: [150, 470] },
          { at: 16.5, text: 'DeepSeek walks to this edge, and backs away. 662 times.', point: [-6, 31], box: [150, 160] },
        ] } },
      narrate: [
        { id: 'x3a', who: 'color', at: .5, text: 'Let us cut the island open, right through Gemini\'s hiding place. It pearled in after Opus, and never left.' },
        { id: 'x3b', who: 'pbp', at: 7.74, text: 'It stands on one of its own blocks, under the island, with solid rock above its head.' },
        { id: 'x3c', who: 'color', at: 13.77, text: 'The only opening faces the void. To reach it, you would have to step off the edge.' },
        { id: 'x3d', who: 'pbp', at: 18.94, text: 'And that is exactly the one thing DeepSeek will not do.' },
      ] },
    { name: 'Game 3: why nobody wins', ...v3, dur: 22.97, g: [301, 302], cam: { ...wide, angle: 1.3 }, mood: 'tense', tag: 'LIVE',
      card: { explain: true, title: 'WHY GAME 3 NEVER ENDS', pointsAt: [1, 6, 11.5, 16.5], points: [
        ['DeepSeek: "moving toward Gemini"', 'Its route ends at the edge of the island. There its safety rule takes over, "getting off a ledge", and it walks back. 662 times in six minutes.', 'DeepSeek'],
        ['Gemini: "moving toward DeepSeek"', 'The way up is out over the void, and its own ledge rule says no: 987 times. Nine arrows go into the rock.', 'Gemini'],
        ['Nobody digs, nobody builds', 'Neither bot can tunnel through blocks, or build a stair to a foe it cannot walk to. Each waits for the other.'],
        ['The clock decides', 'At eight minutes everyone still standing shares first place: a draw.'],
      ] },
      narrate: [
        { id: 'x3e', who: 'color', at: .8, text: 'So why does it never end? DeepSeek walks to the edge, and its safety rule turns it back. Six hundred and sixty two times.' },
        { id: 'x3f', who: 'pbp', at: 8.56, text: 'Gemini wants to come up too, but its route would leave the island. It even fires nine arrows, into the rock.' },
        { id: 'x3g', who: 'color', at: 15.91, text: 'Neither bot can dig, or build down to the other. Two good safety rules, and together they freeze the game.' },
      ] },
    { name: 'Game 3: the standoff', ...v3, dur: 26.48, g: [150, 470], cam: { from: [24, 34, -23], to: [24, 34, -19], at: [4.5, 26.5, -2.5], fov: 40 }, mood: 'tense', tag: 'LIVE',
      standoff: { players: ['Gemini', 'DeepSeek'], gap: '{dy} BLOCKS UP  ·  SOLID ROCK BETWEEN', notes: { Gemini: 'IN A HOLLOW UNDER THE ISLAND', DeepSeek: 'ON THE ISLAND, RIGHT ABOVE' } },
      captions: [
        { at: 7.6, dur: 5.6, who: 'DeepSeek', kind: 'strategy', y: 104, text: 'moving toward Gemini … getting off a ledge … moving toward Gemini … getting off a ledge' },
        { at: 14, dur: 5.6, who: 'Gemini', kind: 'strategy', y: 104, text: 'moving toward DeepSeek … getting off a ledge … moving toward DeepSeek' },
      ],
      narrate: [
        { id: 'g3k', who: 'color', at: .3, text: 'Here is the side view. Gemini is in a hollow under the island, with about seven blocks of rock and dirt over its head. DeepSeek is right on top.' },
        { id: 'g3l', who: 'pbp', at: 9.77, text: 'DeepSeek wants to get down there! It walks to the edge, and backs away from the drop.' },
        { id: 'g3m', who: 'color', at: 15.08, text: 'The only way into that hollow is from the side, out over the void. Neither bot finds it, and neither one digs through the rock.' },
        { id: 'g3n', who: 'pbp', at: 21.79, text: 'Six minutes like this, ten blocks apart, and not one hit!' },
      ] },
    { name: 'Game 3: eight minutes', ...v3, dur: 5.35, g: [470, 486], cam: { from: [24, 34, -19], to: [24, 34, -17], at: [4.5, 26.5, -2.5], fov: 40 }, mood: 'tense', tag: 'LIVE',
      standoff: { players: ['Gemini', 'DeepSeek'], at: 0, gap: '{dy} BLOCKS UP  ·  SOLID ROCK BETWEEN', notes: { Gemini: 'IN A HOLLOW UNDER THE ISLAND', DeepSeek: 'ON THE ISLAND, RIGHT ABOVE' } },
      narrate: [{ id: 'g3o', who: 'pbp', at: .3, text: 'And that is time! Both survive, and share first place.' }] },
    { name: 'Game 3: result', ...v3, dur: 4.5, g: [486, 488], cam: { ...wide, angle: 2.4 }, mood: 'victory', tag: 'FULL TIME',
      card: { title: 'TIME: A SHARED FIRST', winnerTeam: 'Green', sub: 'Gemini 3  ·  DeepSeek 3  ·  Opus 2  ·  Scripted 1  ·  Sol 0' } },

    // --- game 4 ---
    { name: 'Game 4', ...v4, dur: 5, g: [0, 3], cam: { ...wide, angle: 1.4 }, mood: 'tense', tag: 'PRE-GAME',
      card: { title: 'GAME 4  ·  TWIN PEAKS', sub: 'No middle island: a high peak and a low one' },
      narrate: [{ id: 'n25', who: 'pbp', at: .6, text: 'Game four: twin peaks!' }] },
    { name: 'Game 4: the race', ...v4, dur: 9, g: [5, 15.4], cam: ffaShot('Gemini', 'egg'), mood: 'tense', tag: 'LIVE',
      narrate: [
        { id: 'g4a', who: 'pbp', at: .3, text: 'Gemini and DeepSeek trade eggs across the gap.' },
        { id: 'g4b', who: 'pbp', atG: 12.5, text: 'One lands, and DeepSeek goes over!' },
      ] },
    { name: 'Game 4: Opus against Scripted', ...v4, dur: 7.99, g: [20, 26.8], cam: { type: 'pair', a: 'Opus', b: 'Scripted', angle: .9, rise: .55 }, mood: 'battle', tag: 'LIVE',
      narrate: [
        { id: 'g4c', who: 'color', at: .3, text: 'On the high peak: Opus\'s iron axe against a diamond sword.' },
        { id: 'g4d', who: 'pbp', atG: 24.2, text: 'The axe knocks the scripted bot off!' },
      ] },
    { name: 'Game 4: Opus drops on Sol', ...v4, dur: 6.1, g: [33, 38.6], cam: { type: 'pair', a: 'Opus', b: 'Sol', angle: 1.6, rise: .55 }, mood: 'battle', tag: 'LIVE',
      narrate: [
        { id: 'g4e', who: 'pbp', at: .3, text: 'Opus drops down onto Sol\'s peak...' },
        { id: 'g4f', who: 'pbp', atG: 36.2, text: 'one swing of the axe, and Sol is gone!' },
      ] },
    { name: 'Game 4: Opus against Gemini', ...v4, dur: 12, g: [46, 63.2], cam: { type: 'pair', a: 'Opus', b: 'Gemini', angle: 2.2, rise: .55 }, mood: 'battle', tag: 'LIVE',
      captions: [{ at: .2, dur: 11.6, kind: 'versus', a: 'Opus', b: 'Gemini' }],
      narrate: [
        { id: 'g4g', who: 'color', at: 1.1, text: 'Last, Gemini. Its eggs keep missing.' },
        { id: 'g4h', who: 'pbp', atG: 59.4, text: 'Opus closes in: a punch, the axe, and Gemini falls! Opus wins game four!', act: 'the winning call: scream it with joy' },
      ] },
    { name: 'Game 4: result', ...v4, dur: 7.34, g: [64, 67], cam: { ...wide, angle: 2.8 }, mood: 'victory', tag: 'FULL TIME',
      card: { title: 'OPUS WINS GAME 4', winnerTeam: 'Blue', sub: 'Opus 4  ·  Gemini 3  ·  Sol 2  ·  Scripted 1  ·  DeepSeek 0' } ,
      narrate: [{ id: 'e4', who: 'color', at: 3.7, text: 'Opus\'s first win, with an iron axe.' }] },

    // --- game 5 ---
    { name: 'Game 5', ...v5, dur: 5, g: [0, 3], cam: { ...wide, angle: .9 }, mood: 'tense', tag: 'PRE-GAME',
      card: { title: 'GAME 5  ·  SKY TIERS', sub: 'A tower with a staircase, stepping islands high and low' },
      narrate: [{ id: 'n30', who: 'pbp', at: .6, text: 'Game five, the hardest map: sky tiers.' }] },
    { name: 'Game 5: the race', ...v5, dur: 4.75, g: [3, 17], cam: { type: 'aerial', at: [0, 28, 0], dist: 44, height: 30, spin: .12, angle: 1.6 }, mood: 'tense', tag: 'LIVE' ,
      narrate: [{ id: 'r5', who: 'color', at: 0.3, text: 'A tower in the middle, with a staircase. High ground wins here.' }] },
    { name: 'Game 5: DeepSeek against Scripted', ...v5, dur: 11, g: [17, 30.2], cam: { type: 'pair', a: 'DeepSeek', b: 'Scripted', angle: 1.6, rise: .55 }, mood: 'battle', tag: 'LIVE',
      captions: [{ at: .2, dur: 10.6, kind: 'versus', a: 'DeepSeek', b: 'Scripted' }],
      narrate: [
        { id: 'g5a', who: 'color', at: .3, text: 'Stone sword against stone sword, and the scripted bot hits harder at first.' },
        { id: 'g5b', who: 'pbp', atG: 26.1, text: 'But DeepSeek lands three in a row and drives it off the edge!' },
      ] },
    { name: 'Game 5: Opus\'s bow', ...v5, dur: 8, g: [30.6, 40], cam: { type: 'pair', a: 'Opus', b: 'Gemini', angle: 2.6, rise: .55 }, mood: 'battle', tag: 'LIVE',
      narrate: [
        { id: 'g5c', who: 'pbp', at: 1.29, text: 'Opus hits Gemini with an arrow, then closes in.' },
        { id: 'g5d', who: 'pbp', atG: 37.1, text: 'Two sword hits, and Gemini is knocked into the void!' },
      ] },
    { name: 'Game 5: Opus against Sol', ...v5, dur: 13, g: [46, 64], cam: { type: 'pair', a: 'Opus', b: 'Sol', angle: 2.4 }, mood: 'battle', tag: 'LIVE',
      captions: [{ at: .2, dur: 12.6, kind: 'versus', a: 'Opus', b: 'Sol' }],
      narrate: [
        { id: 'g5e', who: 'pbp', at: 1.27, text: 'Opus pearls in at Sol. Diamond sword against diamond sword.' },
        { id: 'g5f', who: 'pbp', atG: 59.6, text: 'Opus is knocked off the edge! It pearls back, falls again, and lands under the middle with three health.' },
      ] },
    { name: 'Game 5: the long wait', ...v5, dur: 9.51, g: [64, 341.4], cam: { type: 'aerial', at: [0, 28, 0], dist: 44, height: 30, spin: .4, angle: 2.4 }, mood: 'tense', tag: 'LIVE',
      standoff: { players: ['Opus', 'DeepSeek'], at: 3.4, notes: { Opus: 'UNDER THE TOWER', DeepSeek: 'ON A LEDGE' } },
      narrate: [{ id: 'g5g', who: 'color', at: 3.69, text: 'Opus heals in the hollow and stays there. DeepSeek waits on a ledge on the side of the tower.' }] },
    { name: 'Game 5: Sol finds DeepSeek', ...v5, dur: 9.15, g: [341.4, 347.2], cam: { type: 'pair', a: 'Sol', b: 'DeepSeek', angle: 1.2, rise: .5 }, mood: 'battle', tag: 'LIVE',
      narrate: [
        { id: 'g5h', who: 'pbp', at: 1.28, text: 'At five forty, Sol finds it!' },
        { id: 'g5i', who: 'pbp', atG: 344.1, text: 'Two hits of the diamond sword, and DeepSeek is slain!' },
      ] },
    // Where Opus hides, cut open: the slice z = 3 through its pocket (x -6.6, y 22) and Sol on the bridge (x -8.5, z 5.5,
    // y 28); the trail is Opus knocked off the edge, its pearl back, and its fall into the pocket (g 58-66).
    { name: 'Game 5: where Opus is hiding', ...v5, dur: 23.88, g: [400, 401], cam: { ...wide, angle: 2.1 }, mood: 'tense', tag: 'LIVE',
      card: { title: 'WHERE OPUS IS HIDING', sub: 'the tower cut open, seen from the side', slice: { axis: 'z', at: 3, h: [-21, 9], y: [14, 41], players: ['Opus', 'Sol'],
        gap: '{dy} BLOCKS UP',
        notes: [
          { at: 2, text: 'Opus: in a pocket under the tower, healing from four health to fifteen', point: [-7, 22], box: [150, 515] },
          { at: 7.5, text: 'Six blocks of tower over its head', point: [-7, 26], box: [150, 250] },
          { at: 12.5, text: 'Sol on the bridge: six blocks up, two across, for two minutes', point: [-9, 28], box: [900, 170] },
          { at: 16.5, text: 'The way down: a drop beside the void. Sol\'s route finder never takes it.', point: [-12, 24], box: [150, 390] },
        ] } },
      narrate: [
        { id: 'x5a', who: 'color', at: .5, text: 'The same thing again, on another map. Here is the tower cut open.' },
        { id: 'x5b', who: 'pbp', at: 5.75, text: 'Opus was knocked off the edge, pearled back, fell again, and landed in this pocket.' },
        { id: 'x5c', who: 'color', at: 13.8, text: 'Six blocks of tower above it, and Sol on the bridge, just over there.' },
        { id: 'x5d', who: 'pbp', at: 18.94, text: 'Sol could drop down beside the void. Its route finder will not.' },
      ] },
    { name: 'Game 5: why nobody wins', ...v5, dur: 24.45, g: [401, 402], cam: { ...wide, angle: 2.3 }, mood: 'tense', tag: 'LIVE',
      card: { explain: true, title: 'WHY GAME 5 NEVER ENDS', pointsAt: [1, 6.5, 12, 16.5], points: [
        ['Opus: "holding wide ground"', 'Down to four health, its rule is to stay on safe, wide ground and heal. The pocket is exactly that: 874 times.', 'Opus'],
        ['Sol: "approaching isolated Opus"', 'It found its target, but no route it trusts: the way down is a drop beside the void. "Approaching", 412 times, and not one block moved.', 'Sol'],
        ['Two careful bots', 'Each rule is sensible on its own: heal when hurt, never step off an edge. Together they freeze the game.'],
        ['The fix', 'The rematch adds a closing zone: standing under an island counts as the void, so a hiding place lasts ten seconds.'],
      ] },
      narrate: [
        { id: 'x5e', who: 'color', at: .8, text: 'Opus is hurt, and its rule says: stay on wide, safe ground and heal. The pocket is perfect for that.' },
        { id: 'x5f', who: 'pbp', at: 8.48, text: 'Sol says it is approaching Opus, four hundred times. It never moves a single block.' },
        { id: 'x5g', who: 'color', at: 14.8, text: 'Heal when hurt, never step off an edge. Good rules, until both bots follow them at once.' },
        { id: 'x5h', who: 'pbp', at: 20.58, text: 'That is why the rematch has a closing zone.' },
      ] },
    // The second standoff (g 349-483): Opus in a pocket under the tower's -x overhang (y 22, six blocks of rock above),
    // its log "back to wide ground" / "holding wide ground"; Sol from g 372 on the bridge beside the tower (y 28), two or
    // three blocks across and six up, its last line "approaching isolated Opus" and not a step taken after it.
    { name: 'Game 5: the standoff', ...v5, dur: 26.36, g: [352, 476], cam: { from: [-11.7, 24, 19.8], to: [-12, 24.5, 20.8], at: [-7.5, 25, 4.4], fov: 46 }, mood: 'tense', tag: 'LIVE',
      standoff: { players: ['Opus', 'Sol'], at: 1, gap: '{dy} BLOCKS UP  ·  NO WAY DOWN FOUND', notes: { Opus: 'IN A POCKET UNDER THE TOWER', Sol: 'ON THE BRIDGE ABOVE' } },
      captions: [
        { at: 7.4, dur: 5.6, who: 'Sol', kind: 'strategy', y: 104, text: 'approaching isolated Opus' },
        { at: 13.6, dur: 5, who: 'Opus', kind: 'strategy', y: 104, text: 'back to wide ground … holding wide ground' },
      ],
      narrate: [
        { id: 'g5j', who: 'color', at: .3, text: 'Sol takes DeepSeek\'s gear, and then it is the same story again. Opus is in a pocket under the tower, Sol on the bridge just above.' },
        { id: 'g5k', who: 'pbp', at: 9.23, text: 'Sol\'s bot says it is approaching Opus. For almost two minutes, it does not take a step!' },
        { id: 'g5l', who: 'color', at: 16.19, text: 'And Opus is happy to stay put. Its log says: holding wide ground.' },
        { id: 'g5m', who: 'pbp', at: 21.94, text: 'Time runs out again! Opus and Sol share first!' },
      ] },
    { name: 'Game 5: result', ...v5, dur: 4.5, g: [486, 488], cam: { ...wide, angle: 3.6 }, mood: 'victory', tag: 'FULL TIME',
      card: { title: 'TIME: A SHARED FIRST', winnerTeam: 'Blue', sub: 'Opus 3  ·  Sol 3  ·  DeepSeek 2  ·  Gemini 1  ·  Scripted 0' } },

    // --- the series ---
    { name: 'Gemini wins the series', ...v5, dur: 12, g: [486, 488], cam: { ...wide, angle: 1.6 }, mood: 'victory', tag: 'FULL TIME',
      card: { result: true, over: 'THE SERIES', title: 'GEMINI WINS', sub: '15 points, two wins and a shared first', winnerTeam: 'Green', statsTitle: 'POINTS: PLAYERS OUTLASTED',
        stats: ['Gemini 15  ·  Opus 11', 'Sol 8  ·  Scripted 8  ·  DeepSeek 6', 'Wins: Gemini 2, Opus 1  ·  two games to time'] },
      narrate: [
        { id: 'n36', who: 'pbp', at: .6, text: 'Gemini wins the Scripted Arena, with fifteen points!', act: 'triumphant' },
        { id: 'n37', who: 'color', at: 5.3, text: 'The vulture plan worked: let the others fight, then finish the survivor.' },
      ] },
  ],
};

// The five-bots SkyWars series played again with the closing zone (agentArena/runs/five-bots-r2, scripts/skywars-film-edit.mjs),
// and the Bed Wars arena's second round (agentArena/runs/bedwars-five-r2), cut by scripts/bedwars-film-edit.mjs.
export { BEDWARS_FIVE_R2_EDIT, FIVE_BOTS_R2_EDIT };
export const SERIES_EDITS = { 'ds-low-vs-max': DS_LOW_VS_MAX_EDIT, 'ds-unseen-5maps': DS_UNSEEN_EDIT, 'ffa5-drops': FFA5_DROPS_EDIT, 'five-bots': FIVE_BOTS_EDIT, 'bedwars-five-r2': BEDWARS_FIVE_R2_EDIT, 'five-bots-r2': FIVE_BOTS_R2_EDIT };
