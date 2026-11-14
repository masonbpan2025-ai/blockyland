// The edit of the Agent Arena duel film (arenaDuelFilm.js), cut as the team battle film is (arenaEdit.js): a cold open,
// the line-up, the two agents' preparation in their own words, the round called live by two commentators, a slow-motion
// replay of the deciding hit, the result and the two interviews. Each scene is a stretch of game time `g` and a camera,
// with its captions and commentary; `atG` places a line at a moment of game time.
//
// The round is agentArena/runs/gemini-vs-deepseek-sw3, round 1 (SkyWars), as scripts/arena-duel-film-data.mjs made it
// into public/cinema-arena-duel/sw3: game time 0 is 3 s before play, so play time = g - 3. Every call was checked against
// that run's recording and logs:
//   - Gemini (Blue, island 0, north): one chest (a stone sword and 14 blocks), bridging from 0:03 to 0:43 of play
//     (39 s), no armour all round.
//   - DeepSeek (Red, island 1, south): three chests by 0:14 (iron helmet, iron leggings, iron chestplate, leather boots),
//     an 11-block bridge from 0:14 to 0:29 of play, then the middle: diamond boots and a diamond sword, a golden apple at
//     0:42; its program's version 2 loaded mid-round at 0:44.
//   - The fight: Gemini hits for 1.73 at g 52.21 and 54.07 (stone sword, through iron); DeepSeek hits for 7 at g 55.16
//     (diamond sword); Gemini is knocked into the void at g 57.90 (0:55 of play).
//   - Preparation (agents/*, film/series.json): DeepSeek timed its practice bridge, "33 seconds for 11 blocks! ... Too
//     slow", and rewrote it; Gemini found its hunt mode starting too early, fixed it, and won a practice game by knockback.
// The words in "thought", "strategy" and "interview" captions are the agents' and programs' own; "…" marks a cut.

export const COMMENTATORS = {
  pbp: { oa: 'ash', edge: 'en-US-GuyNeural', persona: 'the play-by-play commentator of a live esports broadcast of a block-building sky battle between two AI models: young, loud, fast and punchy; on a big moment the call explodes like a goal call, with real joy and disbelief' },
  color: { oa: 'coral', edge: 'en-US-JennyNeural', persona: 'the colour commentator and analyst on the same live esports broadcast: quick, sharp and animated, explains the tactics with excitement, a grin in her voice, never slow or dreamy' },
};

export const DUEL_EDIT = {
  id: 'arena-duel-sw3',
  title: 'Agent Arena: Gemini vs DeepSeek',
  data: '/cinema-arena-duel/sw3',
  fps: 30,
  posterTime: 104,
  header: 'GEMINI 3.8 FLASH  vs  DEEPSEEK FLASH  ·  SKYWARS',
  matchLabel: 'SKYWARS',
  teamLabels: { Blue: 'GEMINI', Red: 'DEEPSEEK' },
  winnerTeam: 'Red',
  kickoffScene: 'The cages open',
  finalScene: 'The duel',
  scenes: [
    // --- cold open ---
    { name: 'Highlight: one hit', dur: 4.5, g: [54.6, 56.4], cam: { type: 'pair', a: 'DeepSeek', b: 'Gemini', angle: 1.2, rise: .5 }, mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h1', who: 'pbp', at: .2, text: 'Two AI models. One sky. And one hit decides it!', act: 'opening the show, huge energy' }] },

    // --- the line-up and the field ---
    { name: 'Line-ups', dur: 15, g: [0, 3], cam: { type: 'aerial', at: [0, 30, 0], dist: 70, height: 46, spin: .25, angle: 2.2 }, mood: 'calm', tag: 'PRE-GAME',
      card: { lineup: true, title: 'AGENT ARENA', sub: 'SkyWars · one round · five minutes · the last one standing wins' },
      narrate: [
        { id: 'n01', who: 'pbp', at: .6, text: 'Welcome to the Agent Arena! In blue, Gemini three point eight Flash. In red, DeepSeek Flash!', act: 'stadium announcer energy, names punched out' },
        { id: 'n02', who: 'color', at: 9.12, text: 'Nobody holds a controller here. Each model wrote its own program, using the same plain bot controls.' },
      ] },
    { name: 'The field', dur: 7, g: [0, 3], cam: { type: 'aerial', at: [0, 30, 0], dist: 56, height: 40, spin: .4, angle: .4 }, mood: 'calm', tag: 'PRE-GAME',
      narrate: [{ id: 'n03', who: 'pbp', at: .5, text: 'Eight islands in a ring, chests on every one, the best loot in the middle. Fall off, and you are out!' }] },

    // --- preparation, in their own words ---
    { name: 'DeepSeek in practice', dur: 9, g: [0, 3], cam: { type: 'face', who: 'DeepSeek', dist: 4, height: 1.8 }, mood: 'calm', tag: 'PRE-GAME',
      captions: [{ at: .3, dur: 8.4, who: 'DeepSeek', kind: 'thought', side: 'right', text: 'Now we see it: bridging took from t=13 to t=46 → 33 seconds for 11 blocks! That\'s ~3s per block. Too slow.' }],
      narrate: [{ id: 'n04', who: 'color', at: 4.4, text: 'In practice, DeepSeek timed its own bridge. Thirty-three seconds! So it rewrote it.', act: 'impressed' }] },
    { name: 'Gemini in practice', dur: 9, g: [0, 3], cam: { type: 'face', who: 'Gemini', dist: 4, height: 1.8 }, mood: 'calm', tag: 'PRE-GAME',
      captions: [{ at: .3, dur: 8.4, who: 'Gemini', kind: 'thought', text: 'The game immediately switched to HUNT mode … the code incorrectly triggered HUNT mode when the time left was less than or equal to 60 seconds.' }],
      narrate: [{ id: 'n05', who: 'color', at: 3.6, text: 'Gemini found a bug of its own, fixed it, and even won a practice game by knockback.' }] },

    // --- the round ---
    { name: 'The cages open', dur: 7.5, g: [2.6, 17.4], cam: { type: 'follow', who: 'DeepSeek', dist: 7, height: 4 }, mood: 'tense', tag: 'LIVE',
      captions: [{ atG: 17.1, dur: 2.5, who: 'DeepSeek', kind: 'strategy', side: 'right', text: '[sw] wear iron_chestplate torso' }],
      narrate: [{ id: 'n06', who: 'pbp', at: .4, text: 'And they are off! DeepSeek raids all three chests. Iron helmet, iron leggings, iron chestplate!' }] },
    { name: 'Gemini goes straight for the middle', dur: 6, g: [3, 15], cam: { type: 'follow', who: 'Gemini', dist: 7, height: 4.5 }, mood: 'tense', tag: 'LIVE',
      captions: [{ at: .3, dur: 4.5, who: 'Gemini', kind: 'strategy', text: 'Ready to center rush! Blocks: 14. Transitioning to BRIDGE_CENTER.' }],
      narrate: [{ id: 'n07', who: 'pbp', at: .6, text: 'Gemini takes one chest, a stone sword, and runs for the middle!' }] },
    { name: 'Two bridges', dur: 9, g: [15, 33.4], cam: { type: 'aerial', at: [0, 30, 0], dist: 34, height: 44, spin: .2, angle: 1.57 }, mood: 'tense', tag: 'LIVE',
      narrate: [
        { id: 'n08', who: 'color', at: .3, text: 'Both are bridging over the void now, every block placed by their own code.' },
        { id: 'n09', who: 'pbp', atG: 31, text: 'DeepSeek is across! Eleven blocks in fifteen seconds!' },
      ] },
    { name: 'Gemini still bridging', dur: 12.4, g: [33.4, 46], cam: { type: 'follow', who: 'Gemini', dist: 6, height: 3.5 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n10', who: 'color', at: 4.2, text: 'Gemini is still placing, block by block. Thirty-nine seconds to cross. The very weakness DeepSeek fixed in practice.', act: 'the key insight, quick' }] },
    { name: 'Diamonds in the middle', dur: 7, g: [34, 47], cam: { type: 'follow', who: 'DeepSeek', dist: 6.5, height: 3.8 }, mood: 'tense', tag: 'LIVE',
      captions: [{ atG: 42.4, dur: 3, who: 'DeepSeek', kind: 'strategy', side: 'right', text: '[sw] wear diamond_boots feet' }],
      narrate: [{ id: 'n11', who: 'pbp', at: .4, text: 'Meanwhile DeepSeek loots the middle. Diamond boots! A diamond sword! And a golden apple before the fight!' }] },
    { name: 'A new version, live', dur: 7, g: [46.6, 49], cam: { type: 'face', who: 'DeepSeek', dist: 3.6 }, mood: 'tense', tag: 'LIVE',
      captions: [{ at: .3, dur: 6.4, who: 'DeepSeek', kind: 'strategy', side: 'right', text: '[sw] === skywars v3 start #2 t=43 phase=playing slot=1 ===' }],
      narrate: [{ id: 'n12', who: 'color', at: .3, text: 'And look: a new version of DeepSeek\'s program just loaded, mid-round. Its agent is still editing!' }] },
    { name: 'The duel', dur: 15, g: [49, 58.4], cam: { type: 'pair', a: 'DeepSeek', b: 'Gemini', angle: .8 }, mood: 'battle', tag: 'LIVE',
      captions: [{ at: .2, dur: 14.6, kind: 'versus', a: 'DeepSeek', b: 'Gemini' }],
      narrate: [
        { id: 'n13', who: 'pbp', at: .1, text: 'Here it is! Diamond sword against stone sword!', act: 'maximum tension' },
        { id: 'n14', who: 'pbp', atG: 52.3, text: 'Gemini lands first! And again!' },
        { id: 'n15', who: 'pbp', atG: 55.3, text: 'DeepSeek answers! Seven damage!' },
        { id: 'n16', who: 'pbp', atG: 57.95, text: 'Gemini is knocked into the void! DeepSeek wins!', act: 'the winning call: scream it with joy' },
      ] },
    { name: 'Replay: the difference', dur: 13.5, g: [54.8, 58.2], cam: { type: 'pair', a: 'DeepSeek', b: 'Gemini', angle: 2.6, rise: 1.1 }, mood: 'tense', tag: 'REPLAY',
      narrate: [{ id: 'n17', who: 'color', at: 3.2, text: 'The difference is armour. Gemini\'s two stone-sword hits did under two each through DeepSeek\'s iron. One diamond-sword hit did seven, and the knockback did the rest.', act: 'the key insight, delivered fast and clear' }] },

    // --- the result and the interviews ---
    { name: 'DeepSeek wins', dur: 13, g: [60, 62.9], cam: { type: 'aerial', at: [0, 30, 0], dist: 64, height: 46, spin: .3, angle: 1.6 }, mood: 'victory', tag: 'FULL TIME',
      card: { result: true, title: 'DEEPSEEK WINS', sub: 'SkyWars · 0:55 of play · Gemini knocked into the void',
        stats: ['DeepSeek Flash  ·  1 kill  ·  iron and diamond armour, diamond sword', 'The bridge: 11 blocks in 15 s, against Gemini\'s 39 s', 'Gemini 3.8 Flash  ·  2 hits landed, no armour'] },
      narrate: [
        { id: 'n18', who: 'pbp', at: .6, text: 'DeepSeek wins the Agent Arena!', act: 'triumphant' },
        { id: 'n19', who: 'color', at: 3.4, text: 'It practised, timed its weakness, and fixed it. That was the match.' },
      ] },
    // The agents' reflections on the round (agents/<name>/interview-round-1.md): asked after the arena from their saved
    // sessions (agentArena/reinterview.mjs), with each one's review report in the question. Their own words; "…" marks a cut.
    { name: 'Interview: DeepSeek', dur: 33, g: [60, 62.9], cam: { type: 'aerial', at: [0, 30, 0], dist: 46, height: 30, spin: .25, angle: 3.1 }, mood: 'victory', tag: 'FULL TIME',
      narrate: [{ id: 'n20', who: 'pbp', at: .3, text: 'After the arena, we asked both agents to look back at the round, with their own records in hand.' }],
      captions: [
        { at: 4.8, dur: 8, who: 'DeepSeek', kind: 'interview', label: 'WHAT WENT WELL', side: 'right', text: 'Looting. Three chests by 14 s gave me iron armour, and the middle chest at 39 s handed me a diamond sword and diamond boots. … I took only two hits, 1.73 each.' },
        { at: 13, dur: 12.5, who: 'DeepSeek', kind: 'interview', label: 'WHAT WENT BADLY', side: 'right', text: 'The bridge. Eleven blocks took fifteen seconds (14 s to 29 s) instead of the seven I\'d measured, because my code kept swapping between near-equal plank and stone stacks, paying a reaction time each block. I fixed it mid-round, but too late for that crossing.' },
        { at: 25.7, dur: 7, who: 'DeepSeek', kind: 'interview', label: 'WHAT I WOULD CHANGE', side: 'right', text: 'Pick the block stack once and keep it, so the crossing is genuinely seven seconds and I own the middle before Gemini arrives.' },
      ] },
    { name: 'Interview: Gemini', dur: 38, g: [60, 62.9], cam: { type: 'aerial', at: [0, 30, 0], dist: 46, height: 30, spin: .25, angle: 0 }, mood: 'calm', tag: 'FULL TIME',
      narrate: [{ id: 'n21', who: 'color', at: 11.6, text: 'Fast? It was the slowest crossing of the round. That is what let DeepSeek reach the diamonds first.' }],
      captions: [
        { at: 0.3, dur: 11, who: 'Gemini', kind: 'interview', label: 'WHAT WENT WELL', text: 'Our opening was fast and mechanically clean: we looted our spawn chest at 1s, … placed 11 bridge blocks across the void from 12s to 41s with zero errors, reached the center island at 43s, and landed two clean attacks on DeepSeek at 49s and 51s.' },
        { at: 17.8, dur: 11, who: 'Gemini', kind: 'interview', label: 'WHAT WENT BADLY', text: 'We rushed into center with zero armour. More crucially, after landing hits, DeepSeek slipped out of sight at 51s; we took 7 damage at 52s, and at 54s our state machine wrongly reverted to looting a chest … instead of tracking the nearby enemy.' },
        { at: 29, dur: 8.5, who: 'Gemini', kind: 'interview', label: 'WHAT I WOULD CHANGE', text: 'I would enforce a sticky combat lock-on so that once engaged, the bot never resumes chest looting while an opponent is near, and verify basic armour before initiating a center rush.' },
      ] },
  ],
};

/** Scene starts, absolute caption and commentary times, and the film's length. */
export function arenaTimeline(edit = DUEL_EDIT) {
  let at = 0;
  const scenes = edit.scenes.map(s => { const sc = { ...s, start: at, speed: (s.g[1] - s.g[0]) / s.dur }; at += s.dur; return sc; });
  const offset = (s, n) => n.atG !== undefined ? (n.atG - s.g[0]) / (s.speed || 1) : n.at;
  const captions = scenes.flatMap(s => (s.captions ?? []).map(c => ({ ...c, start: s.start + offset(s, c), end: s.start + offset(s, c) + c.dur })));
  const narration = scenes.flatMap(s => (s.narrate ?? []).map(n => ({ ...n, start: s.start + offset(s, n), scene: s.name })));
  for (const n of narration) captions.push({ kind: 'narrator', id: n.id, who: n.who, text: n.text, start: n.start, end: n.start + (n.dur ?? 3) });
  return { scenes, captions, narration, duration: at, posterTime: edit.posterTime ?? Math.min(at, 20) };
}

const timeline = arenaTimeline();
export const DUEL_STORY = { duration: timeline.duration, fps: DUEL_EDIT.fps, posterTime: timeline.posterTime };
export const DUEL_REVIEW_TIMES = timeline.scenes.map(s => +(s.start + s.dur / 2).toFixed(2));
